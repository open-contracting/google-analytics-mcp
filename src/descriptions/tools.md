<!--
Copyright 2025 Google LLC. Modifications copyright 2026 Open Contracting Partnership.
Licensed under the Apache License, Version 2.0. See licenses/Apache-2.0.txt.

Adapted from the tool docstrings and `_run_*_description()` functions in
https://github.com/googleanalytics/google-analytics-mcp (analytics_mcp/tools).
Modified to write examples as JSON with enum names, and to remove references to tools that this server doesn't provide.
-->

# get_account_summaries

Retrieves information about the user's Google Analytics accounts and properties.

# get_property_details

Returns details about a property.

# list_google_ads_links

Returns a list of links to Google Ads accounts for a property.

# list_property_annotations

Returns annotations for a property.

Annotations are a feature that allows you to leave notes on Google Analytics for specific dates or periods. They are typically used to record service releases, marketing campaign launches or changes, and rapid traffic increases or decreases due to external factors.

# get_custom_dimensions_and_metrics

Returns the property's custom dimensions and metrics.

# run_report

Runs a Google Analytics Data API report.

{{snake_case}}

## Hints for arguments

Here are some hints that outline the expected format and requirements for arguments.

### Hints for `dimensions`

The `dimensions` list must consist solely of either of the following:

1. Standard dimensions defined in the HTML table at https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema#dimensions. These dimensions are available to *every* property.
2. Custom dimensions for the `property_id`. Use the `get_custom_dimensions_and_metrics` tool to retrieve the list of custom dimensions for a property.

### Hints for `metrics`

The `metrics` list must consist solely of either of the following:

1. Standard metrics defined in the HTML table at https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema#metrics. These metrics are available to *every* property.
2. Custom metrics for the `property_id`. Use the `get_custom_dimensions_and_metrics` tool to retrieve the list of custom metrics for a property.

### Hints for `date_ranges`:
{{date_ranges}}

### Hints for `dimension_filter`:
{{dimension_filter}}

### Hints for `metric_filter`:
{{metric_filter}}

### Hints for `order_bys`:
{{order_bys}}

# run_realtime_report

Runs a Google Analytics Data API realtime report.

See https://developers.google.com/analytics/devguides/reporting/data/v1/realtime-basics for more information.

{{snake_case}}

## Hints for arguments

Here are some hints that outline the expected format and requirements for arguments.

### Hints for `dimensions`

The `dimensions` list must consist solely of either of the following:

1. Realtime standard dimensions defined in the HTML table at https://developers.google.com/analytics/devguides/reporting/data/v1/realtime-api-schema#dimensions. These dimensions are available to *every* property.
2. User-scoped custom dimensions for the `property_id`. Use the `get_custom_dimensions_and_metrics` tool to retrieve the list of custom dimensions for a property, and look for the custom dimensions with an `apiName` that begins with "customUser:".

### Hints for `metrics`

The `metrics` list must consist solely of the Realtime standard metrics defined in the HTML table at https://developers.google.com/analytics/devguides/reporting/data/v1/realtime-api-schema#metrics. These metrics are available to *every* property.

Realtime reports can't use custom metrics.

### Hints for `dimension_filter`:
{{dimension_filter}}

### Hints for `metric_filter`:
{{metric_filter}}

### Hints for `order_bys`:
{{order_bys}}

# run_funnel_report

Run a Google Analytics Data API funnel report.

See the funnel report guide at https://developers.google.com/analytics/devguides/reporting/data/v1/funnels for details and examples.

Returns the funnel report response, including:
- funnel_table: Table showing progression through funnel steps
- funnel_visualization: Data for visualizing the funnel
- property_quota: (if requested) Current quota usage information

## Hints for arguments

Here are some hints that outline the expected format and requirements for arguments.

### Hints for `funnel_breakdown`

The `funnel_breakdown` parameter allows you to segment funnel results by a dimension:
  {"breakdown_dimension": "deviceCategory"}
Common breakdown dimensions include:
- `deviceCategory` - Desktop, Mobile, Tablet
- `country` - User's country
- `operatingSystem` - User's operating system
- `browser` - User's browser

### Hints for `funnel_next_action`

The `funnel_next_action` parameter analyzes what users do after completing or dropping off from the funnel:
  {"next_action_dimension": "eventName", "limit": 5}
Common next action dimensions include:
- `eventName` - Next events users trigger
- `pagePath` - Next pages users visit

### Hints for `segments`

The `segments` parameter allows you to segment funnel results by user criteria. Each segment is a Data API Segment object. See https://developers.google.com/analytics/devguides/reporting/data/v1/funnels#segments for details and examples.

### Hints for `date_ranges`:
{{date_ranges}}

### Hints for `funnel_steps`

Example funnel_steps configurations:

1. Simple event-based step (first open/visit):
  {"name": "First open/visit", "filter_expression": {"or_group": {"expressions": [{"funnel_event_filter": {"event_name": "first_open"}}, {"funnel_event_filter": {"event_name": "first_visit"}}]}}}

2. Field filter for organic traffic:
  {"name": "Organic visitors", "filter_expression": {"funnel_field_filter": {"field_name": "firstUserMedium", "string_filter": {"match_type": "CONTAINS", "case_sensitive": false, "value": "organic"}}}}

3. Simple event filter:
  {"name": "Session start", "filter_expression": {"funnel_event_filter": {"event_name": "session_start"}}}

4. Multiple events with OR condition:
  {"name": "Screen/Page view", "filter_expression": {"or_group": {"expressions": [{"funnel_event_filter": {"event_name": "screen_view"}}, {"funnel_event_filter": {"event_name": "page_view"}}]}}}

5. Purchase events (multiple event types):
  {"name": "Purchase", "filter_expression": {"or_group": {"expressions": [{"funnel_event_filter": {"event_name": "purchase"}}, {"funnel_event_filter": {"event_name": "in_app_purchase"}}]}}}

6. Event with parameter filter (value > 50):
  {"name": "Add to cart (value > 50)", "filter_expression": {"funnel_event_filter": {"event_name": "add_to_cart", "funnel_parameter_filter_expression": {"funnel_parameter_filter": {"event_parameter_name": "value", "numeric_filter": {"operation": "GREATER_THAN", "value": {"double_value": 50.0}}}}}}}

7. Complex AND condition (page view + specific path):
  {"name": "Home page view", "filter_expression": {"and_group": {"expressions": [{"funnel_event_filter": {"event_name": "page_view"}}, {"funnel_field_filter": {"field_name": "pageLocation", "string_filter": {"match_type": "CONTAINS", "value": "/"}}}]}}}

## Complete Funnel Example

A typical e-commerce funnel with 5 steps:
  [ {"name": "First open/visit", "filter_expression": {"or_group": {"expressions": [{"funnel_event_filter": {"event_name": "first_open"}}, {"funnel_event_filter": {"event_name": "first_visit"}}]}}}, {"name": "Organic visitors", "filter_expression": {"funnel_field_filter": {"field_name": "firstUserMedium", "string_filter": {"match_type": "CONTAINS", "case_sensitive": false, "value": "organic"}}}}, {"name": "Session start", "filter_expression": {"funnel_event_filter": {"event_name": "session_start"}}}, {"name": "Screen/Page view", "filter_expression": {"or_group": {"expressions": [{"funnel_event_filter": {"event_name": "screen_view"}}, {"funnel_event_filter": {"event_name": "page_view"}}]}}}, {"name": "Purchase", "filter_expression": {"or_group": {"expressions": [{"funnel_event_filter": {"event_name": "purchase"}}, {"funnel_event_filter": {"event_name": "in_app_purchase"}}]}}} ]

# run_conversions_report

Runs a Google Analytics Data API conversions report.

USE THIS TOOL INSTEAD OF `run_report` WHEN:
- You need to report specifically on conversions, ad performance, return on ad spend (ROAS), or attribution.
- You need to query specific conversion metrics (e.g., advertiserAdCost, returnOnAdSpendByInteractionDate, allConversionsByConversionDate, etc.).
- You need to apply a specific attribution model (e.g., DATA_DRIVEN or LAST_CLICK) to your data.
- The user's query explicitly asks about conversions, ad clicks, ad costs, or campaigns related to conversions.

See the conversions report guide at https://developers.google.com/analytics/devguides/reporting/data/v1/conversions-api-basics for details and examples.

## Hints for arguments

Here are some hints that outline the expected format and requirements for arguments.

### Hints for `dimensions`

The `dimensions` list must consist solely of the following allowed standard dimensions:
campaignName, continent, country, defaultChannelGroup, deviceCategory, medium, platform, primaryChannelGroup, source, sourceMedium, sourcePlatform, subcontinent

### Hints for `metrics`

The `metrics` list must consist solely of the following allowed standard metrics:
advertiserAdClicks, advertiserAdCost, advertiserAdCostPerAllConversionsByConversionDate, advertiserAdCostPerAllConversionsByInteractionDate, advertiserAdCostPerClick, advertiserAdImpressions, allConversionsByConversionDate, allConversionsByInteractionDate, returnOnAdSpendByConversionDate, returnOnAdSpendByInteractionDate, totalRevenueByConversionDate, totalRevenueByInteractionDate

### Hints for `conversion_spec`

The `conversion_spec` argument is required for conversions reporting. You can pass an empty list for `conversion_actions` if you want all conversion events. Example:
  {"conversion_actions": ["conversionActions/12345"], "attribution_model": "DATA_DRIVEN"}
Use [] for all actions, and "LAST_CLICK" for last-click attribution.

### Hints for `date_ranges`:
{{date_ranges}}

### Hints for `dimension_filter`:
{{dimension_filter}}

### Hints for `metric_filter`:
{{metric_filter}}

### Hints for `order_bys`:
{{order_bys}}
