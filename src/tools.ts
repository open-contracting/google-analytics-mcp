import * as d from "./descriptions";
import { ADMIN, type Client, DATA, propertyName, ToolError } from "./ga";

/** The date that the tools were last compared with Google's server. */
export const LAST_COMPARED = "2026-10-27";

type Args = Record<string, unknown>;

interface Tool {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, object>; required: string[] };
  run(client: Client, args: Args): Promise<unknown>;
}

const objects = { type: "array", items: { type: "object" } };
const strings = { type: "array", items: { type: "string" } };

// The JSON Schema type of each argument. Its description is in descriptions/arguments.md.
const TYPES: Record<string, object> = {
  property_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
  date_ranges: objects,
  dimensions: strings,
  metrics: strings,
  dimension_filter: { type: "object" },
  metric_filter: { type: "object" },
  order_bys: objects,
  limit: { type: "integer" },
  offset: { type: "integer" },
  currency_code: { type: "string" },
  return_property_quota: { type: "boolean" },
  conversion_spec: { type: "object" },
  funnel_steps: objects,
  funnel_breakdown: { type: "object" },
  funnel_next_action: { type: "object" },
  segments: objects,
};

const REPORT = ["dimensions", "metrics", "dimension_filter", "metric_filter", "order_bys", "limit", "offset"];
const REALTIME_REPORT = ["property_id", ...REPORT, "return_property_quota"];
const DATED_REPORT = ["property_id", "date_ranges", ...REPORT, "currency_code", "return_property_quota"];

function tool(name: string, argNames: string[], required: string[], run: Tool["run"]): Tool {
  const description = d.tools[name];
  if (description === undefined) {
    throw new Error(`No description for tool ${name}`);
  }
  const properties = Object.fromEntries(argNames.map((arg) => [arg, { ...TYPES[arg], description: d.args[arg] }]));
  return { name, description, inputSchema: { type: "object", properties, required }, run };
}

function propertyTool(name: string, run: (client: Client, property: string) => Promise<unknown>): Tool {
  return tool(name, ["property_id"], ["property_id"], (client, args) => run(client, propertyName(args.property_id)));
}

/** Return the request body: the named arguments that are set, with dimension and metric names expanded. */
function reportBody(args: Args, argNames: string[]): Args {
  const body: Args = {};
  for (const arg of argNames) {
    const value = args[arg];
    if (
      arg === "property_id" ||
      value === undefined ||
      value === null ||
      value === "" ||
      (Array.isArray(value) && !value.length)
    ) {
      continue;
    }
    body[arg] = arg === "dimensions" || arg === "metrics" ? (value as string[]).map((name) => ({ name })) : value;
  }
  return body;
}

/** Return a funnel step, expanding the `event` shorthand into a filter expression. */
function funnelStep(step: unknown, index: number): Args {
  if (!step || typeof step !== "object" || Array.isArray(step)) {
    throw new ToolError(`Step ${index + 1} must be an object.`);
  }
  const { name = `Step ${index + 1}`, filter_expression, event } = step as Args;
  if (filter_expression) {
    return { name, filter_expression };
  }
  if (event) {
    return { name, filter_expression: { funnel_event_filter: { event_name: event } } };
  }
  throw new ToolError(`Step ${index + 1} must contain either 'filter_expression' or 'event' key.`);
}

export const tools: Tool[] = [
  tool("get_account_summaries", [], [], (client) =>
    client.list(`${ADMIN}/v1beta/accountSummaries`, "accountSummaries"),
  ),
  propertyTool("get_property_details", (client, p) => client.get(`${ADMIN}/v1beta/${p}`, p)),
  propertyTool("list_google_ads_links", (client, p) =>
    client.list(`${ADMIN}/v1beta/${p}/googleAdsLinks`, "googleAdsLinks", p),
  ),
  propertyTool("list_property_annotations", (client, p) =>
    client.list(`${ADMIN}/v1alpha/${p}/reportingDataAnnotations`, "reportingDataAnnotations", p),
  ),
  propertyTool("get_custom_dimensions_and_metrics", async (client, p) => {
    const metadata = await client.get(`${DATA}/v1beta/${p}/metadata`, p);
    const custom = (items: unknown) => ((items as Args[] | undefined) ?? []).filter((item) => item.customDefinition);
    return { custom_dimensions: custom(metadata.dimensions), custom_metrics: custom(metadata.metrics) };
  }),
  tool("run_report", DATED_REPORT, ["property_id", "date_ranges", "dimensions", "metrics"], (client, args) => {
    const p = propertyName(args.property_id);
    return client.post(`${DATA}/v1beta/${p}:runReport`, reportBody(args, DATED_REPORT), p);
  }),
  tool("run_realtime_report", REALTIME_REPORT, ["property_id", "dimensions", "metrics"], (client, args) => {
    const p = propertyName(args.property_id);
    return client.post(`${DATA}/v1beta/${p}:runRealtimeReport`, reportBody(args, REALTIME_REPORT), p);
  }),
  tool(
    "run_funnel_report",
    [
      "property_id",
      "funnel_steps",
      "date_ranges",
      "funnel_breakdown",
      "funnel_next_action",
      "segments",
      "return_property_quota",
    ],
    ["property_id", "funnel_steps"],
    (client, args) => {
      const p = propertyName(args.property_id);
      const steps = args.funnel_steps;
      if (!Array.isArray(steps) || !steps.length) {
        throw new ToolError("funnel_steps must contain at least one step.");
      }
      const body: Args = {
        funnel: { steps: steps.map(funnelStep) },
        ...reportBody(args, ["date_ranges", "segments", "return_property_quota"]),
      };
      const breakdown = args.funnel_breakdown as Args | undefined;
      if (breakdown?.breakdown_dimension) {
        body.funnel_breakdown = { breakdown_dimension: { name: breakdown.breakdown_dimension } };
      }
      const next = args.funnel_next_action as Args | undefined;
      if (next?.next_action_dimension) {
        body.funnel_next_action = {
          next_action_dimension: { name: next.next_action_dimension },
          ...(next.limit === undefined ? {} : { limit: next.limit }),
        };
      }
      return client.post(`${DATA}/v1alpha/${p}:runFunnelReport`, body, p);
    },
  ),
  tool(
    "run_conversions_report",
    [...DATED_REPORT, "conversion_spec"],
    ["property_id", "date_ranges", "dimensions", "metrics", "conversion_spec"],
    (client, args) => {
      const p = propertyName(args.property_id);
      return client.post(`${DATA}/v1alpha/${p}:runReport`, reportBody(args, [...DATED_REPORT, "conversion_spec"]), p);
    },
  ),
];
