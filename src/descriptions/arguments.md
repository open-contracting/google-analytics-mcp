<!--
Copyright 2025 Google LLC. Modifications copyright 2026 Open Contracting Partnership.
Licensed under the Apache License, Version 2.0. See licenses/Apache-2.0.txt.

Adapted from the `Args` sections of the tool docstrings in https://github.com/googleanalytics/google-analytics-mcp
(analytics_mcp/tools). Modified to write examples as JSON with enum names, and to remove references to tools that
this server doesn't provide.
-->

# property_id

The Google Analytics property ID. Accepted formats are:
- A number
- A string consisting of 'properties/' followed by a number

# dimensions

A list of dimensions to include in the report.

# metrics

A list of metrics to include in the report.

# date_ranges

A list of date ranges (https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/DateRange) to include in the report.

# dimension_filter

A Data API FilterExpression (https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/FilterExpression) to apply to the dimensions. Don't use this for filtering metrics. Use metric_filter instead. The `field_name` in a `dimension_filter` must be a dimension.

# metric_filter

A Data API FilterExpression (https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/FilterExpression) to apply to the metrics. Don't use this for filtering dimensions. Use dimension_filter instead. The `field_name` in a `metric_filter` must be a metric.

# order_bys

A list of Data API OrderBy (https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/OrderBy) objects to apply to the dimensions and metrics.

# limit

The maximum number of rows to return in each response. Value must be a positive integer <= 250,000. Used to paginate through large reports, following the guide at https://developers.google.com/analytics/devguides/reporting/data/v1/basics#pagination.

# offset

The row count of the start row. The first row is counted as row 0. Used to paginate through large reports, following the guide at https://developers.google.com/analytics/devguides/reporting/data/v1/basics#pagination.

# currency_code

The currency code to use for currency values. Must be in ISO4217 format, such as "AED", "USD", "JPY". If the field is empty, the report uses the property's default currency.

# return_property_quota

Whether to return property quota in the response.

# conversion_spec

The specification for conversions reporting. Should include 'conversion_actions' (list of resource names) and 'attribution_model'.

# funnel_steps

A list of funnel steps. Each step should be an object containing:
- 'name': (str) Display name for the step
- 'filter_expression': (object) Complete filter expression for the step
OR for simple event-based steps:
- 'name': (str) Display name for the step
- 'event': (str) Event name to filter on

# funnel_breakdown

Optional breakdown dimension to segment the funnel. This creates separate funnel results for each value of the dimension. Example: {"breakdown_dimension": "deviceCategory"}

# funnel_next_action

Optional next action analysis configuration. This analyzes what users do after completing or dropping off from the funnel. Example: {"next_action_dimension": "eventName", "limit": 5}

# segments

Optional list of segments to apply to the funnel.
