import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Props } from "../src/auth";
import { createServer } from "../src/index";
import { env, mockFetch } from "./helpers";

const ADMIN = "https://analyticsadmin.googleapis.com";
const DATA = "https://analyticsdata.googleapis.com";

let client: Client;

beforeEach(async () => {
  const props: Props = { sub: "1", refreshToken: "refresh", accessToken: "access", expiresAt: Date.now() + 3600_000 };
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer(env, props).connect(serverTransport);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientTransport);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const [content] = result.content as Array<{ text: string }>;
  return { isError: result.isError ?? false, text: content?.text ?? "" };
}

describe("tools/list", () => {
  it("lists the nine read-only tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      "get_account_summaries",
      "get_property_details",
      "list_google_ads_links",
      "list_property_annotations",
      "get_custom_dimensions_and_metrics",
      "run_report",
      "run_realtime_report",
      "run_funnel_report",
      "run_conversions_report",
    ]);
    for (const tool of tools) {
      expect(tool.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, openWorldHint: true });
      expect(JSON.stringify(tool.inputSchema)).not.toMatch(/"additionalProperties":\{/);
      expect(tool.description).not.toMatch(/\{\{/);
      for (const [name, schema] of Object.entries(tool.inputSchema.properties ?? {})) {
        expect((schema as { description?: string }).description, `${tool.name}.${name}`).toMatch(/\w/);
      }
    }
  });
});

describe("tools/call", () => {
  it("get_account_summaries", async () => {
    const calls = mockFetch({ json: { accountSummaries: [{ account: "accounts/1" }] } });
    expect(JSON.parse((await call("get_account_summaries")).text)).toEqual([{ account: "accounts/1" }]);
    expect(calls[0]).toMatchObject({ method: "GET", url: `${ADMIN}/v1beta/accountSummaries?pageSize=200` });
    expect(calls[0]?.headers.authorization).toBe("Bearer access");
  });

  it("get_property_details", async () => {
    const calls = mockFetch({ json: { name: "properties/123" } });
    await call("get_property_details", { property_id: "properties/123" });
    expect(calls[0]).toMatchObject({ method: "GET", url: `${ADMIN}/v1beta/properties/123` });
  });

  it("list_google_ads_links", async () => {
    const calls = mockFetch({ json: { googleAdsLinks: [] } });
    expect((await call("list_google_ads_links", { property_id: 123 })).text).toBe("[]");
    expect(calls[0]?.url).toBe(`${ADMIN}/v1beta/properties/123/googleAdsLinks?pageSize=200`);
  });

  it("list_property_annotations", async () => {
    const calls = mockFetch({ json: { reportingDataAnnotations: [{ title: "Launch" }] } });
    await call("list_property_annotations", { property_id: "123" });
    expect(calls[0]?.url).toBe(`${ADMIN}/v1alpha/properties/123/reportingDataAnnotations?pageSize=200`);
  });

  it("get_custom_dimensions_and_metrics", async () => {
    const calls = mockFetch({
      json: {
        dimensions: [{ apiName: "date" }, { apiName: "customEvent:form_id", customDefinition: true }],
        metrics: [{ apiName: "sessions" }, { apiName: "customEvent:score", customDefinition: true }],
      },
    });
    expect(JSON.parse((await call("get_custom_dimensions_and_metrics", { property_id: 123 })).text)).toEqual({
      custom_dimensions: [{ apiName: "customEvent:form_id", customDefinition: true }],
      custom_metrics: [{ apiName: "customEvent:score", customDefinition: true }],
    });
    expect(calls[0]?.url).toBe(`${DATA}/v1beta/properties/123/metadata`);
  });

  it("run_report", async () => {
    const calls = mockFetch({ json: { rows: [], rowCount: 0 } });
    await call("run_report", {
      property_id: 123,
      date_ranges: [{ start_date: "30daysAgo", end_date: "yesterday" }],
      dimensions: ["landingPage"],
      metrics: ["sessions"],
      dimension_filter: { filter: { field_name: "country", string_filter: { match_type: "EXACT", value: "Kenya" } } },
      order_bys: [{ metric: { metric_name: "sessions" }, desc: true }],
      limit: 10,
      offset: 0,
      currency_code: "",
    });
    expect(calls[0]).toEqual({
      method: "POST",
      url: `${DATA}/v1beta/properties/123:runReport`,
      headers: expect.any(Object),
      body: {
        dateRanges: [{ startDate: "30daysAgo", endDate: "yesterday" }],
        dimensions: [{ name: "landingPage" }],
        metrics: [{ name: "sessions" }],
        dimensionFilter: { filter: { fieldName: "country", stringFilter: { matchType: "EXACT", value: "Kenya" } } },
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 10,
        offset: 0,
      },
    });
  });

  it("run_realtime_report", async () => {
    const calls = mockFetch({ json: { rows: [] } });
    await call("run_realtime_report", {
      property_id: 123,
      dimensions: ["country"],
      metrics: ["activeUsers"],
      return_property_quota: true,
    });
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: `${DATA}/v1beta/properties/123:runRealtimeReport`,
      body: { dimensions: [{ name: "country" }], metrics: [{ name: "activeUsers" }], returnPropertyQuota: true },
    });
  });

  it("run_funnel_report", async () => {
    const calls = mockFetch({ json: { funnelTable: {} } });
    await call("run_funnel_report", {
      property_id: 123,
      funnel_steps: [
        { name: "Visit", event: "first_visit" },
        { filter_expression: { funnel_event_filter: { event_name: "page_view" } } },
      ],
      date_ranges: [{ start_date: "7daysAgo", end_date: "today" }],
      funnel_breakdown: { breakdown_dimension: "deviceCategory" },
      funnel_next_action: { next_action_dimension: "eventName", limit: 5 },
    });
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: `${DATA}/v1alpha/properties/123:runFunnelReport`,
      body: {
        funnel: {
          steps: [
            { name: "Visit", filterExpression: { funnelEventFilter: { eventName: "first_visit" } } },
            { name: "Step 2", filterExpression: { funnelEventFilter: { eventName: "page_view" } } },
          ],
        },
        dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
        funnelBreakdown: { breakdownDimension: { name: "deviceCategory" } },
        funnelNextAction: { nextActionDimension: { name: "eventName" }, limit: 5 },
      },
    });
  });

  it("run_funnel_report rejects invalid steps", async () => {
    const calls = mockFetch();
    expect(await call("run_funnel_report", { property_id: 123, funnel_steps: [] })).toEqual({
      isError: true,
      text: "funnel_steps must contain at least one step.",
    });
    expect((await call("run_funnel_report", { property_id: 123, funnel_steps: [{ name: "x" }] })).text).toMatch(
      /Step 1 must contain/,
    );
    expect(calls).toHaveLength(0);
  });

  it("run_conversions_report", async () => {
    const calls = mockFetch({ json: { rows: [] } });
    await call("run_conversions_report", {
      property_id: 123,
      date_ranges: [{ start_date: "2026-01-01", end_date: "2026-01-31" }],
      dimensions: ["sourceMedium"],
      metrics: ["allConversionsByConversionDate"],
      conversion_spec: { conversion_actions: [], attribution_model: "DATA_DRIVEN" },
    });
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: `${DATA}/v1alpha/properties/123:runReport`,
      body: {
        dateRanges: [{ startDate: "2026-01-01", endDate: "2026-01-31" }],
        dimensions: [{ name: "sourceMedium" }],
        metrics: [{ name: "allConversionsByConversionDate" }],
        conversionSpec: { conversionActions: [], attributionModel: "DATA_DRIVEN" },
      },
    });
  });

  it("returns API errors as tool errors", async () => {
    mockFetch({ status: 403, json: { error: { status: "PERMISSION_DENIED", message: "Denied." } } });
    const result = await call("get_property_details", { property_id: 9 });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/does not have access to property 9/);
  });

  it("rejects an invalid property ID without a network call", async () => {
    const calls = mockFetch();
    expect((await call("run_report", { property_id: "G-ABC" })).text).toMatch(/measurement ID/);
    expect(calls).toHaveLength(0);
  });

  it("rejects unknown tools", async () => {
    expect(await call("create_property_annotation", { property_id: 1 })).toEqual({
      isError: true,
      text: "Tool 'create_property_annotation' not implemented by this server.",
    });
  });

  it("logs only the tool name, property ID, status and duration", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    mockFetch({ json: { rows: [{ dimensionValues: [{ value: "secret report content" }] }] } });
    await call("run_report", { property_id: 7, date_ranges: [], dimensions: ["x"], metrics: ["y"] });
    expect(log).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(Object.keys(entry).sort()).toEqual(["duration_ms", "property", "status", "tool"]);
    expect(entry).toMatchObject({ tool: "run_report", property: "properties/7", status: "ok" });
  });
});
