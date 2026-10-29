export const ADMIN = "https://analyticsadmin.googleapis.com";
export const DATA = "https://analyticsdata.googleapis.com";

// Every Google Analytics endpoint this server may call. All are reads: the POST endpoints run reports, which take
// the report definition in the request body.
const ALLOWED: ReadonlyArray<readonly ["GET" | "POST", RegExp]> = [
  ["GET", /^https:\/\/analyticsadmin\.googleapis\.com\/v1beta\/accountSummaries$/],
  ["GET", /^https:\/\/analyticsadmin\.googleapis\.com\/v1beta\/properties\/\d+$/],
  ["GET", /^https:\/\/analyticsadmin\.googleapis\.com\/v1beta\/properties\/\d+\/googleAdsLinks$/],
  ["GET", /^https:\/\/analyticsadmin\.googleapis\.com\/v1alpha\/properties\/\d+\/reportingDataAnnotations$/],
  ["GET", /^https:\/\/analyticsdata\.googleapis\.com\/v1beta\/properties\/\d+\/metadata$/],
  ["POST", /^https:\/\/analyticsdata\.googleapis\.com\/v1beta\/properties\/\d+:(runReport|runRealtimeReport)$/],
  ["POST", /^https:\/\/analyticsdata\.googleapis\.com\/v1alpha\/properties\/\d+:(runReport|runFunnelReport)$/],
];

const MAX_PAGES = 50;

export class ToolError extends Error {}

/** Throw unless the method and URL (ignoring the query string) are on the read-only allowlist. */
export function assertAllowed(method: string, url: string): void {
  const { origin, pathname } = new URL(url);
  const base = `${origin}${pathname}`;
  if (!ALLOWED.some(([m, pattern]) => m === method && pattern.test(base))) {
    throw new ToolError(`Blocked: ${method} ${base} is not on this server's read-only allowlist.`);
  }
}

/** Return the property resource name for a number, a numeric string, or "properties/<number>". */
export function propertyName(value: unknown): string {
  const text = String(value ?? "").trim();
  const match = /^(?:properties\/)?(\d+)$/.exec(text);
  if (!match) {
    const hint = /^G-/i.test(text) ? ` "${text}" is a measurement ID, not a property ID.` : "";
    throw new ToolError(
      `Invalid property ID: ${JSON.stringify(value)}.${hint} Use a number like 123456789 or "properties/123456789". ` +
        "Call get_account_summaries to list the properties you can access.",
    );
  }
  return `properties/${match[1]}`;
}

/** Convert snake_case keys to the camelCase that the REST APIs document. Values are unchanged. */
export function camelize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(camelize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase()),
        camelize(v),
      ]),
    );
  }
  return value;
}

interface GoogleErrorBody {
  error?: { code?: number; status?: string; message?: string; details?: Array<{ reason?: string }> };
}

/** Return a message for Claude that explains a failed Google Analytics API response. */
export function describeError(status: number, body: GoogleErrorBody, property?: string): string {
  const reason = body.error?.status ?? "";
  const message = body.error?.message ?? `HTTP ${status}`;
  const subject = property ? `property ${property.replace("properties/", "")}` : "this resource";

  if (status === 429 || reason === "RESOURCE_EXHAUSTED") {
    return (
      `Google Analytics quota exceeded: ${message} Try again later, or narrow the request: a shorter date range, ` +
      "fewer dimensions, or a lower limit."
    );
  }
  if (status === 401 || reason === "UNAUTHENTICATED") {
    return "Your Google sign-in has expired or was revoked. Disconnect and reconnect this connector in Claude.";
  }
  if (body.error?.details?.some((detail) => detail.reason === "SERVICE_DISABLED")) {
    return `A Google Analytics API is not enabled in the server's Google Cloud project. Tell its administrator: ${message}`;
  }
  if (status === 403 || reason === "PERMISSION_DENIED") {
    return (
      `Your Google account does not have access to ${subject}. Call get_account_summaries to list the properties ` +
      `you can access, or ask the property's administrator to grant you the Viewer role. (${message})`
    );
  }
  if (status === 404 || reason === "NOT_FOUND") {
    return `${subject[0]?.toUpperCase()}${subject.slice(1)} was not found, or your Google account can't access it. (${message})`;
  }
  return `Google Analytics API error (${reason || status}): ${message}`;
}

export interface Client {
  get(path: string, property?: string): Promise<Record<string, unknown>>;
  post(path: string, body: unknown, property?: string): Promise<Record<string, unknown>>;
  list(path: string, key: string, property?: string): Promise<unknown[]>;
}

/** Return a Google Analytics client that authenticates with `getToken`, refreshing once on a 401. */
export function createClient(getToken: (forceRefresh?: boolean) => Promise<string>): Client {
  async function request(method: "GET" | "POST", url: string, body?: unknown, property?: string) {
    assertAllowed(method, url);
    let response: Response | undefined;
    for (const forceRefresh of [false, true]) {
      response = await fetch(url, {
        method,
        headers: {
          authorization: `Bearer ${await getToken(forceRefresh)}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(camelize(body)),
      });
      if (response.status !== 401) {
        break;
      }
    }
    const json = (await response?.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response?.ok) {
      throw new ToolError(describeError(response?.status ?? 0, json as GoogleErrorBody, property));
    }
    return json;
  }

  return {
    get: (path, property) => request("GET", path, undefined, property),
    post: (path, body, property) => request("POST", path, body, property),
    async list(path, key, property) {
      const items: unknown[] = [];
      let pageToken = "";
      for (let page = 0; page < MAX_PAGES; page++) {
        const url = new URL(path);
        url.searchParams.set("pageSize", "200");
        if (pageToken) {
          url.searchParams.set("pageToken", pageToken);
        }
        const json = await request("GET", url.toString(), undefined, property);
        items.push(...((json[key] as unknown[] | undefined) ?? []));
        pageToken = (json.nextPageToken as string | undefined) ?? "";
        if (!pageToken) {
          break;
        }
      }
      return items;
    },
  };
}
