import {
  AuthorizationError,
  authorizationErrorRedirect,
  CimdFetchError,
  type ConsentDescription,
  OAuthError,
  type OAuthHelpers,
  type TokenExchangeCallbackOptions,
  type TokenExchangeCallbackResult,
} from "@cloudflare/workers-oauth-provider";

export interface Env {
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  ALLOWED_EMAIL_DOMAIN: string;
}

/** The grant's encrypted props. */
export interface Props {
  sub: string;
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
}

const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const SCOPES = ["openid", "email", ANALYTICS_SCOPE];
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const EXPIRY_MARGIN_SECONDS = 60;

interface GoogleTokens {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

class SignInError extends Error {}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function page(title: string, body: string, status = 200, headers = new Headers()): Response {
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
      `<title>${escapeHtml(title)}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:36rem;` +
      `margin:10vh auto;padding:0 1rem}button{font:inherit;padding:.4rem 1rem}</style>` +
      `<h1>${escapeHtml(title)}</h1>${body}</html>`,
    { status, headers },
  );
}

function consentPage(details: ConsentDescription, handle: string, domain: string, headers: Headers): Response {
  const origin = details.clientDomain
    ? `It is published by <strong>${escapeHtml(details.clientDomain)}</strong>.`
    : "It registered itself, so its name is not verified.";
  const loopback = details.redirectIsLoopback
    ? "<p><strong>This sends access to an app on your computer.</strong> Continue only if you just started " +
      "connecting from it.</p>"
    : "";
  return page(
    "Connect Google Analytics",
    `<p><strong>${escapeHtml(details.clientName)}</strong> wants read-only access to the Google Analytics properties ` +
      `that your Google account can see. ${origin} Access will be sent to ` +
      `<strong>${escapeHtml(details.redirectHost)}</strong>.</p>${loopback}` +
      `<p>Next, sign in with your @${escapeHtml(domain)} Google account.</p>` +
      `<form method="post"><input type="hidden" name="handle" value="${escapeHtml(handle)}">` +
      `<button name="decision" value="approve">Continue</button> <button name="decision" value="deny">Cancel</button>` +
      "</form>",
    200,
    headers,
  );
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function requestTokens(env: Env, params: Record<string, string>): Promise<GoogleTokens> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...params }),
  });
  const json = (await response.json().catch(() => ({}))) as GoogleTokens & { error?: string };
  if (!response.ok) {
    throw new OAuthError(json.error === "invalid_grant" ? "invalid_grant" : "temporarily_unavailable", {
      description: `Google token request failed: ${json.error ?? response.status}`,
      statusCode: json.error === "invalid_grant" ? 400 : 503,
    });
  }
  return json;
}

/** Return the claims of a Google ID token, after checking the issuer, audience, expiry and email domain. */
export function verifyIdToken(idToken: string, clientId: string, domain: string, now = Date.now()) {
  // Signature verification is unnecessary for an ID token received directly from Google's token endpoint over TLS.
  // https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation
  let claims: Record<string, unknown>;
  try {
    const payload = (idToken.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
    claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))));
  } catch {
    throw new SignInError("Google returned an unreadable identity token.");
  }
  if (!GOOGLE_ISSUERS.has(String(claims.iss)) || claims.aud !== clientId || Number(claims.exp) * 1000 < now) {
    throw new SignInError("Google returned an identity token that is not valid for this server.");
  }
  const email = String(claims.email ?? "").toLowerCase();
  const expected = domain.toLowerCase();
  if (claims.hd !== expected || !email.endsWith(`@${expected}`)) {
    throw new SignInError(
      `Only @${domain} Google accounts can use this server. Sign in with your @${domain} account.`,
    );
  }
  if (typeof claims.sub !== "string" || !claims.sub) {
    throw new SignInError("Google returned an identity token without a user ID.");
  }
  return { sub: claims.sub };
}

/** Return a fresh access token for the grant's Google refresh token. */
async function refreshAccessToken(env: Env, refreshToken: string, now = Date.now()) {
  const tokens = await requestTokens(env, { grant_type: "refresh_token", refresh_token: refreshToken });
  return {
    accessToken: tokens.access_token,
    expiresAt: now + tokens.expires_in * 1000,
    ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
  };
}

/** Return the props' access token, or a refreshed one if it has expired or `force` is set. */
export async function accessToken(env: Env, props: Props, force = false, now = Date.now()): Promise<string> {
  if (!force && props.expiresAt - EXPIRY_MARGIN_SECONDS * 1000 > now) {
    return props.accessToken;
  }
  Object.assign(props, await refreshAccessToken(env, props.refreshToken, now));
  return props.accessToken;
}

/** Match the lifetime of Claude's access token to Google's, and refresh Google's when Claude refreshes. */
export async function tokenExchangeCallback(
  options: TokenExchangeCallbackOptions<Env>,
  now = Date.now(),
): Promise<TokenExchangeCallbackResult | undefined> {
  const props = options.props as Props;
  if (options.grantType === "authorization_code") {
    return { accessTokenTTL: Math.max(60, Math.floor((props.expiresAt - now) / 1000) - EXPIRY_MARGIN_SECONDS) };
  }
  if (options.grantType === "refresh_token") {
    const refreshed = await refreshAccessToken(options.env, props.refreshToken, now);
    return {
      newProps: { ...props, ...refreshed },
      accessTokenTTL: Math.max(60, Math.floor((refreshed.expiresAt - now) / 1000) - EXPIRY_MARGIN_SECONDS),
    };
  }
  return undefined;
}

async function authorize(request: Request, env: Env): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  if (request.method === "GET") {
    const authRequest = await oauth.parseAuthRequest(request);
    const details = await oauth.describeConsent(authRequest);
    const consent = await oauth.beginConsent(authRequest);
    return consentPage(details, consent.handle, env.ALLOWED_EMAIL_DOMAIN, consent.headers);
  }

  const form = await request.formData();
  const handle = String(form.get("handle"));
  if (form.get("decision") !== "approve") {
    const denied = await oauth.denyConsent(request, handle);
    return new Response(null, { status: 302, headers: denied.headers });
  }
  const approved = await oauth.approveConsent(request, handle);
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  const { state, headers } = await oauth.beginUpstream(approved.request, {
    data: { verifier },
    headers: approved.headers,
  });
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: new URL("/callback", request.url).toString(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    hd: env.ALLOWED_EMAIL_DOMAIN,
    state,
    code_challenge: await sha256(verifier),
    code_challenge_method: "S256",
  }).toString();
  headers.set("location", url.toString());
  return new Response(null, { status: 302, headers });
}

async function callback(request: Request, env: Env): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  const { request: authRequest, data, headers } = await oauth.finishUpstream<{ verifier: string }>(request);
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  if (params.get("error") || !code) {
    headers.set("location", authorizationErrorRedirect(authRequest, "access_denied"));
    return new Response(null, { status: 302, headers });
  }

  const tokens = await requestTokens(env, {
    grant_type: "authorization_code",
    code,
    code_verifier: data.verifier,
    redirect_uri: new URL("/callback", request.url).toString(),
  });
  if (!tokens.id_token || !tokens.refresh_token) {
    throw new SignInError("Google did not return the expected tokens. Try connecting again.");
  }
  if (!tokens.scope?.split(" ").includes(ANALYTICS_SCOPE)) {
    throw new SignInError("Google Analytics access was not granted. Connect again, and allow access to Analytics.");
  }
  const { sub } = verifyIdToken(tokens.id_token, env.GOOGLE_CLIENT_ID, env.ALLOWED_EMAIL_DOMAIN);

  const props: Props = {
    sub,
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  };
  const { redirectTo } = await oauth.completeAuthorization({
    request: authRequest,
    userId: sub,
    metadata: {},
    scope: authRequest.scope,
    props,
  });
  headers.set("location", redirectTo);
  return new Response(null, { status: 302, headers });
}

/** Handle the authorization pages, and render sign-in failures for the user. */
export const authHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    try {
      if (pathname === "/authorize" && (request.method === "GET" || request.method === "POST")) {
        return await authorize(request, env);
      }
      if (pathname === "/callback" && request.method === "GET") {
        return await callback(request, env);
      }
    } catch (error) {
      if (error instanceof AuthorizationError && error.redirectTo) {
        return Response.redirect(error.redirectTo, 302);
      }
      if (error instanceof AuthorizationError || error instanceof CimdFetchError || error instanceof SignInError) {
        const message =
          error instanceof CimdFetchError
            ? "This app could not be verified."
            : error instanceof AuthorizationError
              ? error.description
              : error.message;
        return page("Couldn't connect", `<p>${escapeHtml(message)}</p>`, error instanceof SignInError ? 403 : 400);
      }
      if (error instanceof OAuthError) {
        return page("Couldn't connect", `<p>${escapeHtml(error.description)} Try connecting again.</p>`, 502);
      }
      throw error;
    }
    if (pathname === "/") {
      return new Response("Google Analytics MCP server. Add <origin>/mcp as a custom connector in Claude.\n");
    }
    return new Response("Not found\n", { status: 404 });
  },
};
