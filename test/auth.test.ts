import { OAuthError, type TokenExchangeCallbackOptions } from "@cloudflare/workers-oauth-provider";
import { afterEach, describe, expect, it, vi } from "vitest";
import { accessToken, type Env, type Props, tokenExchangeCallback, verifyIdToken } from "../src/auth";
import { env, mockFetch } from "./helpers";

const NOW = 1_800_000_000_000;

function idToken(claims: Record<string, unknown>): string {
  const payload = btoa(
    JSON.stringify({
      iss: "https://accounts.google.com",
      aud: "client-id",
      exp: NOW / 1000 + 3600,
      sub: "1234",
      email: "staff@open-contracting.org",
      hd: "open-contracting.org",
      ...claims,
    }),
  ).replace(/=+$/, "");
  return `header.${payload}.signature`;
}

function props(overrides: Partial<Props> = {}): Props {
  return { sub: "1234", refreshToken: "refresh", accessToken: "old", expiresAt: NOW + 3600_000, ...overrides };
}

function exchangeOptions(grantType: string, p: Props): TokenExchangeCallbackOptions<Env> {
  return { grantType, props: p, env } as unknown as TokenExchangeCallbackOptions<Env>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifyIdToken", () => {
  it("accepts an OCP account", () => {
    expect(verifyIdToken(idToken({}), "client-id", "open-contracting.org", NOW)).toEqual({ sub: "1234" });
  });

  it.each([
    ["a personal account", { email: "someone@gmail.com", hd: undefined }],
    ["another Workspace domain", { email: "someone@example.org", hd: "example.org" }],
    ["an OCP email in another Workspace", { hd: "example.org" }],
    ["another domain in the OCP Workspace", { email: "someone@example.org" }],
    ["a lookalike domain", { email: "someone@evil-open-contracting.org", hd: "evil-open-contracting.org" }],
    ["a subdomain", { email: "someone@sub.open-contracting.org" }],
  ])("rejects %s", (_, claims) => {
    expect(() => verifyIdToken(idToken(claims), "client-id", "open-contracting.org", NOW)).toThrow(
      "Only @open-contracting.org Google accounts can use this server.",
    );
  });

  it.each([
    ["another audience", { aud: "other-client" }],
    ["another issuer", { iss: "https://example.com" }],
    ["an expired token", { exp: NOW / 1000 - 1 }],
  ])("rejects %s", (_, claims) => {
    expect(() => verifyIdToken(idToken(claims), "client-id", "open-contracting.org", NOW)).toThrow(/not valid/);
  });

  it("rejects a malformed token", () => {
    expect(() => verifyIdToken("garbage", "client-id", "open-contracting.org", NOW)).toThrow(/unreadable/);
  });
});

describe("accessToken", () => {
  it("returns an unexpired token without refreshing", async () => {
    const calls = mockFetch();
    expect(await accessToken(env, props(), false, NOW)).toBe("old");
    expect(calls).toHaveLength(0);
  });

  it("refreshes an expired token", async () => {
    const calls = mockFetch({ json: { access_token: "new", expires_in: 3599 } });
    const p = props({ expiresAt: NOW + 30_000 });
    expect(await accessToken(env, p, false, NOW)).toBe("new");
    expect(p).toMatchObject({ accessToken: "new", expiresAt: NOW + 3599_000, refreshToken: "refresh" });
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "https://oauth2.googleapis.com/token",
      body: {
        grant_type: "refresh_token",
        refresh_token: "refresh",
        client_id: "client-id",
        client_secret: "client-secret",
      },
    });
  });

  it("refreshes when forced", async () => {
    mockFetch({ json: { access_token: "new", expires_in: 3599 } });
    expect(await accessToken(env, props(), true, NOW)).toBe("new");
  });
});

describe("tokenExchangeCallback", () => {
  it("matches the first access token's lifetime to Google's", async () => {
    expect(await tokenExchangeCallback(exchangeOptions("authorization_code", props()), NOW)).toEqual({
      accessTokenTTL: 3540,
    });
  });

  it("refreshes the Google token when Claude refreshes its token", async () => {
    mockFetch({ json: { access_token: "new", expires_in: 3599 } });
    expect(await tokenExchangeCallback(exchangeOptions("refresh_token", props()), NOW)).toEqual({
      newProps: props({ accessToken: "new", expiresAt: NOW + 3599_000 }),
      accessTokenTTL: 3539,
    });
  });

  it("stores a rotated refresh token", async () => {
    mockFetch({ json: { access_token: "new", expires_in: 3599, refresh_token: "rotated" } });
    const result = await tokenExchangeCallback(exchangeOptions("refresh_token", props()), NOW);
    expect(result?.newProps).toMatchObject({ refreshToken: "rotated" });
  });

  it("revokes the grant if Google revoked access", async () => {
    mockFetch({ status: 400, json: { error: "invalid_grant" } });
    const promise = tokenExchangeCallback(exchangeOptions("refresh_token", props()), NOW);
    await expect(promise).rejects.toBeInstanceOf(OAuthError);
    await expect(promise).rejects.toMatchObject({ code: "invalid_grant" });
  });

  it("keeps the grant if Google is unavailable", async () => {
    mockFetch({ status: 503, json: {} });
    await expect(tokenExchangeCallback(exchangeOptions("refresh_token", props()), NOW)).rejects.toMatchObject({
      code: "temporarily_unavailable",
    });
  });
});
