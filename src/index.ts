import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { accessToken, authHandler, type Env, type Props, tokenExchangeCallback } from "./auth";
import { createClient, propertyName, ToolError } from "./ga";
import { tools } from "./tools";

const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: true };

/** Return an MCP server whose tools call Google Analytics as the signed-in user. */
export function createServer(env: Env, props: Props): Server {
  const server = new Server({ name: "Google Analytics", version: "1.0.0" }, { capabilities: { tools: {} } });
  const client = createClient((force) => accessToken(env, props, force));

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema, annotations })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    const tool = toolsByName.get(params.name);
    const args = params.arguments ?? {};
    const start = Date.now();
    let status = "ok";
    try {
      if (!tool) {
        throw new ToolError(`Tool '${params.name}' not implemented by this server.`);
      }
      const result = await tool.run(client, args);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error) {
      status = error instanceof ToolError ? "tool_error" : "error";
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: message }], isError: true };
    } finally {
      let property: string | undefined;
      try {
        property = args.property_id === undefined ? undefined : propertyName(args.property_id);
      } catch {}
      console.log(JSON.stringify({ tool: params.name, property, status, duration_ms: Date.now() - start }));
    }
  });

  return server;
}

const mcpHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const server = createServer(env, ctx.props as Props);
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
    await server.connect(transport);
    return transport.handleRequest(request);
  },
};

// The provider needs the canonical resource URL, which is known only from a request.
const providers = new Map<string, OAuthProvider<Env>>();

function provider(origin: string): OAuthProvider<Env> {
  let instance = providers.get(origin);
  if (!instance) {
    instance = new OAuthProvider<Env>({
      apiRoute: "/mcp",
      apiHandler: mcpHandler,
      defaultHandler: authHandler,
      authorizeEndpoint: "/authorize",
      tokenEndpoint: "/token",
      clientRegistrationEndpoint: "/register",
      resourceMetadata: { resource: `${origin}/mcp`, resource_name: "Google Analytics" },
      refreshTokenTTL: 90 * 24 * 60 * 60,
      refreshTokenIdleTTL: 90 * 24 * 60 * 60,
      tokenExchangeCallback: (options) => tokenExchangeCallback(options),
    });
    providers.set(origin, instance);
  }
  return instance;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return provider(new URL(request.url).origin).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
