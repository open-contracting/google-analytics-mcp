import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { expect, it } from "vitest";
import { createServer } from "../src/index";
import { env } from "./helpers";

async function post(body: unknown) {
  const server = createServer(env, {
    sub: "1",
    refreshToken: "r",
    accessToken: "a",
    expiresAt: Date.now() + 3600_000,
  });
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  const response = await transport.handleRequest(
    new Request("https://example.com/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...(body as object) }),
    }),
  );
  return { status: response.status, json: (await response.json()) as { result: Record<string, unknown[]> } };
}

it("serves each request with a new server", async () => {
  const init = await post({
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } },
  });
  expect(init.status).toBe(200);

  const list = await post({ method: "tools/list" });
  expect(list.status).toBe(200);
  expect(list.json.result.tools).toHaveLength(9);
});
