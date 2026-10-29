import { afterEach, describe, expect, it, vi } from "vitest";
import { assertAllowed, camelize, createClient, describeError, propertyName, ToolError } from "../src/ga";
import { mockFetch } from "./helpers";

const ADMIN = "https://analyticsadmin.googleapis.com";
const DATA = "https://analyticsdata.googleapis.com";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("assertAllowed", () => {
  it.each([
    ["GET", `${ADMIN}/v1beta/accountSummaries`],
    ["GET", `${ADMIN}/v1beta/accountSummaries?pageSize=200&pageToken=abc`],
    ["GET", `${ADMIN}/v1beta/properties/123`],
    ["GET", `${ADMIN}/v1beta/properties/123/googleAdsLinks`],
    ["GET", `${ADMIN}/v1alpha/properties/123/reportingDataAnnotations`],
    ["GET", `${DATA}/v1beta/properties/123/metadata`],
    ["POST", `${DATA}/v1beta/properties/123:runReport`],
    ["POST", `${DATA}/v1beta/properties/123:runRealtimeReport`],
    ["POST", `${DATA}/v1alpha/properties/123:runFunnelReport`],
    ["POST", `${DATA}/v1alpha/properties/123:runReport`],
  ])("allows %s %s", (method, url) => {
    expect(() => assertAllowed(method, url)).not.toThrow();
  });

  it.each([
    ["PATCH", `${ADMIN}/v1beta/properties/123`],
    ["PUT", `${ADMIN}/v1beta/properties/123`],
    ["DELETE", `${ADMIN}/v1beta/properties/123`],
    ["POST", `${ADMIN}/v1beta/properties/123`],
    ["POST", `${ADMIN}/v1alpha/properties/123/reportingDataAnnotations`],
    ["POST", `${ADMIN}/v1beta/properties/123/googleAdsLinks`],
    ["GET", `${ADMIN}/v1beta/properties/123/customDimensions`],
    ["GET", `${ADMIN}/v1beta/properties/123/../../accounts/1`],
    ["GET", `${ADMIN}/v1beta/properties/abc`],
    ["GET", "http://analyticsadmin.googleapis.com/v1beta/accountSummaries"],
    ["GET", "https://analyticsadmin.googleapis.com.example.com/v1beta/accountSummaries"],
    ["GET", "https://example.com/v1beta/accountSummaries"],
    ["POST", `${DATA}/v1beta/properties/123:batchRunReports`],
    ["POST", `${DATA}/v1beta/properties/123:runReport/extra`],
    ["GET", `${DATA}/v1beta/properties/123:runReport`],
  ])("rejects %s %s", (method, url) => {
    expect(() => assertAllowed(method, url)).toThrow(ToolError);
  });

  it("rejects before any network call", async () => {
    const calls = mockFetch();
    const client = createClient(async () => "token");
    await expect(client.get(`${ADMIN}/v1beta/properties/123/customDimensions`)).rejects.toThrow(/allowlist/);
    expect(calls).toHaveLength(0);
  });
});

describe("propertyName", () => {
  it.each([
    [123, "properties/123"],
    ["123", "properties/123"],
    [" properties/123 ", "properties/123"],
  ])("accepts %j", (value, expected) => {
    expect(propertyName(value)).toBe(expected);
  });

  it.each(["", "abc", "properties/", "123/../456", "accounts/123", undefined])("rejects %j", (value) => {
    expect(() => propertyName(value)).toThrow(ToolError);
  });

  it("explains measurement IDs", () => {
    expect(() => propertyName("G-ABC123")).toThrow(/measurement ID/);
  });
});

describe("camelize", () => {
  it("converts keys but not values", () => {
    expect(
      camelize({ field_name: "customEvent:form_id", in_list_filter: { values: ["a_b"] }, and_group: [] }),
    ).toEqual({ fieldName: "customEvent:form_id", inListFilter: { values: ["a_b"] }, andGroup: [] });
  });
});

describe("describeError", () => {
  it("explains quota errors", () => {
    const message = describeError(429, { error: { status: "RESOURCE_EXHAUSTED", message: "Exhausted." } });
    expect(message).toMatch(/quota exceeded/);
    expect(message).toMatch(/Try again later/);
    expect(message).toMatch(/date range/);
  });

  it("explains quota errors with another HTTP status", () => {
    expect(describeError(403, { error: { status: "RESOURCE_EXHAUSTED" } })).toMatch(/quota exceeded/);
  });

  it("explains missing access", () => {
    const message = describeError(403, { error: { status: "PERMISSION_DENIED", message: "Denied." } }, "properties/9");
    expect(message).toMatch(/does not have access to property 9/);
    expect(message).toMatch(/get_account_summaries/);
  });

  it("explains disabled APIs", () => {
    const body = { error: { status: "PERMISSION_DENIED", details: [{ reason: "SERVICE_DISABLED" }] } };
    expect(describeError(403, body)).toMatch(/not enabled/);
  });

  it("passes other errors through", () => {
    const body = { error: { status: "INVALID_ARGUMENT", message: "Field foo is not a valid dimension." } };
    expect(describeError(400, body)).toBe(
      "Google Analytics API error (INVALID_ARGUMENT): Field foo is not a valid dimension.",
    );
  });
});

describe("createClient", () => {
  it("sends the access token and a camelCase body", async () => {
    const calls = mockFetch({ json: { rows: [] } });
    const client = createClient(async () => "token");
    await client.post(`${DATA}/v1beta/properties/1:runReport`, { date_ranges: [{ start_date: "today" }] });
    expect(calls[0]?.headers.authorization).toBe("Bearer token");
    expect(calls[0]?.body).toEqual({ dateRanges: [{ startDate: "today" }] });
  });

  it("follows page tokens", async () => {
    const calls = mockFetch(
      { json: { accountSummaries: [{ name: "a" }], nextPageToken: "next" } },
      { json: { accountSummaries: [{ name: "b" }] } },
    );
    const client = createClient(async () => "token");
    expect(await client.list(`${ADMIN}/v1beta/accountSummaries`, "accountSummaries")).toEqual([
      { name: "a" },
      { name: "b" },
    ]);
    expect(calls.map((call) => call.url)).toEqual([
      `${ADMIN}/v1beta/accountSummaries?pageSize=200`,
      `${ADMIN}/v1beta/accountSummaries?pageSize=200&pageToken=next`,
    ]);
  });

  it("refreshes the token once on a 401", async () => {
    const calls = mockFetch({ status: 401, json: {} }, { json: { name: "properties/1" } });
    const getToken = vi.fn(async (force?: boolean) => (force ? "new" : "old"));
    const client = createClient(getToken);
    expect(await client.get(`${ADMIN}/v1beta/properties/1`)).toEqual({ name: "properties/1" });
    expect(calls.map((call) => call.headers.authorization)).toEqual(["Bearer old", "Bearer new"]);
  });

  it("raises a tool error for a failed response", async () => {
    mockFetch({ status: 429, json: { error: { status: "RESOURCE_EXHAUSTED", message: "Exhausted." } } });
    const client = createClient(async () => "token");
    await expect(client.post(`${DATA}/v1beta/properties/1:runReport`, {})).rejects.toThrow(/quota exceeded/);
  });
});
