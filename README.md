# Google Analytics MCP server

A remote [MCP](https://modelcontextprotocol.io) server on Cloudflare Workers that gives Claude read-only access to Google Analytics 4 (GA4). Each person signs in with their own Google account, so Claude sees only the properties that they can see.

Its tools match those of [Google's official server](https://github.com/googleanalytics/google-analytics-mcp), except that this server provides no tools that write:

| Tool                                | API               |
| ----------------------------------- | ----------------- |
| `get_account_summaries`             | Admin API v1beta  |
| `get_property_details`              | Admin API v1beta  |
| `list_google_ads_links`             | Admin API v1beta  |
| `list_property_annotations`         | Admin API v1alpha |
| `get_custom_dimensions_and_metrics` | Data API v1beta   |
| `run_report`                        | Data API v1beta   |
| `run_realtime_report`               | Data API v1beta   |
| `run_funnel_report`                 | Data API v1alpha  |
| `run_conversions_report`            | Data API v1alpha  |

## How it works

- **Authorization.** [`@cloudflare/workers-oauth-provider`](https://github.com/cloudflare/workers-oauth-provider) makes the Worker an OAuth 2.1 server for Claude. Its `/authorize` page asks the person to approve the client, then sends them to Google to sign in.
- **Sign-in.** Google is asked for the `openid`, `email` and `analytics.readonly` scopes only. The Worker accepts the sign-in only if the ID token has an email address at `ALLOWED_EMAIL_DOMAIN`, and its `hd` (Workspace domain) claim is the same domain.
- **Tokens.** The person's Google refresh and access tokens are stored in the grant's encrypted props in KV. Claude never sees them. Claude's access token expires when Google's does. When Claude refreshes its token, the Worker refreshes Google's. If Google has revoked access, the grant is revoked and the person is asked to reconnect.
- **Read-only.** The scope is read-only. `src/ga.ts` also checks every request against an allowlist of GA API URLs before calling `fetch`. It allows only `GET` and, for running reports, `POST`.
- **Logging.** Each tool call logs its name, property ID, status and duration. Nothing else is logged: no tokens, email addresses or report contents.

## Set up Google Cloud

In a Google Cloud project owned by the organization, like `ocp-analytics-mcp` (a project ID can't contain "google"):
1. Go to _APIs & Services_ > _Library_, and enable the **Google Analytics Data API** and the **Google Analytics Admin API**.
1. Go to _Google Auth Platform_ > _Branding_, and configure the consent screen. Set the app name to one without "Google", per Google's branding rules, like "OCP Analytics MCP". On _Audience_, set the user type to **Internal**. This avoids Google's app verification, stops refresh tokens from expiring after 7 days, and allows only the organization's accounts to sign in.
1. On _Data Access_, add the scopes `openid`, `https://www.googleapis.com/auth/userinfo.email` and `https://www.googleapis.com/auth/analytics.readonly`.
1. On _Clients_, create an OAuth client:
   - Application type: **Web application**
   - **Use this client for an AI-powered agent**: checked (it can't be changed later)
   - Authorized redirect URI: `https://<worker-host>/callback`, for example `https://google-analytics-mcp.opencontracting.workers.dev/callback`

   Copy the client ID and client secret.

## Deploy

Install the dependencies:

```bash
pnpm install
```

Create the KV namespace, and replace the placeholder `id` in `wrangler.toml` with the ID that this prints:

```bash
pnpm exec wrangler kv namespace create OAUTH_KV
```

Set the OAuth client's credentials as secrets:

```bash
pnpm exec wrangler secret put GOOGLE_CLIENT_ID
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
```

Deploy the Worker:

```bash
pnpm exec wrangler deploy
```

To change the Worker's name, and therefore its `workers.dev` hostname, edit `name` in `wrangler.toml`, and update the redirect URI in Google Cloud.

## Add the connector in Claude

An organization owner adds the server once:
1. Go to _Organization settings_ > _Connectors_.
1. Click _Add_, then _Custom_, then _Web_.
1. Enter a name, like "Google Analytics", and the URL `https://<worker-host>/mcp`.

Then, each person goes to _Settings_ > _Connectors_, clicks _Connect_ next to the connector, and signs in with their Google account.

## Verify a deployment

```bash
npx @modelcontextprotocol/inspector
```

In the inspector, set the transport to _Streamable HTTP_ and the URL to `https://<worker-host>/mcp`, and connect. Check that:
- An account at `ALLOWED_EMAIL_DOMAIN` can sign in, and an account elsewhere (like a Gmail account) is refused.
- Each tool returns data for a property that you can access.

## Develop

Run the tests, type checker and linters:

```bash
pnpm exec vitest run
pnpm exec tsc
pre-commit run --all-files
pnpm exec knip
```

Run the Worker locally, with your OAuth client's credentials in a `.dev.vars` file (which is ignored by git):

```bash
pnpm exec wrangler dev
```

Add `http://localhost:8787/callback` as a redirect URI in Google Cloud to sign in locally.

View the production logs:

```bash
pnpm exec wrangler tail
```

To add a tool, add it to `src/tools.ts`, and add its description to `src/descriptions/tools.md`. If it calls a new endpoint, add the endpoint to `ALLOWED` in `src/ga.ts`. The endpoint must not write.

### Edit descriptions

Claude reads the tools' descriptions to decide how to call them. They are in Markdown files in `src/descriptions/`, under level-1 headings:
- `tools.md`: each tool's description, under the tool's name
- `arguments.md`: each argument's description, under the argument's name, used by every tool that takes that argument
- `hints.md`: hints that the other files include with `{{name}}`, under the hint's name

Biome ignores these files, so that their text stays close to Google's.

### Check for changes to Google's server

The tools follow [Google's server](https://github.com/googleanalytics/google-analytics-mcp). They were last compared with its commit `a7b483f` (2026-10-27). To check for changes since then, open:

https://github.com/googleanalytics/google-analytics-mcp/compare/a7b483f...main

The relevant files are:

| Google's file                               | What to compare                                                | Here                                |
| ------------------------------------------- | -------------------------------------------------------------- | ----------------------------------- |
| `analytics_mcp/coordinator.py`              | Which tools are read-only, required arguments, schema clean-up | `src/tools.ts`, `src/index.ts`      |
| `analytics_mcp/tools/admin/info.py`         | Admin tools' arguments, endpoints and docstrings               | `src/tools.ts`, `src/descriptions/` |
| `analytics_mcp/tools/reporting/*.py`        | Report tools' arguments, request fields and docstrings         | `src/tools.ts`, `src/descriptions/` |
| `analytics_mcp/tools/reporting/metadata.py` | Hints and examples                                             | `src/descriptions/hints.md`         |

Ignore write tools, like `create_property_annotation`. After porting any changes, update the commit and date above.

## License

MIT, except for the files in `src/descriptions/`, which are adapted from Google's server under the Apache License 2.0. See [NOTICE](NOTICE).
