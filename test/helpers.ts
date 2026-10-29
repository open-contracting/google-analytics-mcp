import { vi } from "vitest";

export interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Replace `fetch` with a mock that records calls and answers with the given responses, in order. */
export function mockFetch(...responses: Array<{ status?: number; json: unknown }>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const body = init.body;
      calls.push({
        method: init.method ?? "GET",
        url: String(url),
        headers: Object.fromEntries(new Headers(init.headers).entries()),
        body:
          body instanceof URLSearchParams
            ? Object.fromEntries(body)
            : typeof body === "string"
              ? JSON.parse(body)
              : undefined,
      });
      const response = responses.shift() ?? { json: {} };
      return new Response(JSON.stringify(response.json), { status: response.status ?? 200 });
    }),
  );
  return calls;
}

export const env = {
  OAUTH_KV: {} as KVNamespace,
  OAUTH_PROVIDER: {} as never,
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  ALLOWED_EMAIL_DOMAIN: "open-contracting.org",
};
