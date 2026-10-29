import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "markdown-as-text",
      transform: (code, id) => (id.endsWith(".md") ? `export default ${JSON.stringify(code)};` : undefined),
    },
  ],
  resolve: {
    alias: { "cloudflare:workers": fileURLToPath(new URL("test/cloudflare-workers.ts", import.meta.url)) },
  },
  test: {
    // Transform the library, so that the alias applies to its import.
    server: { deps: { inline: ["@cloudflare/workers-oauth-provider"] } },
  },
});
