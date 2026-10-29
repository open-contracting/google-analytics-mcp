<!--
Copyright 2025 Google LLC. Modifications copyright 2026 Open Contracting Partnership.
Licensed under the Apache License, Version 2.0. See licenses/Apache-2.0.txt.

Adapted from the hints in `reporting/metadata.py` in https://github.com/googleanalytics/google-analytics-mcp
(analytics_mcp/tools). Modified to write examples as JSON with enum names, and to remove references to tools that
this server doesn't provide.
-->

# snake_case

Note that the reference docs at https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta all use camelCase field names, but field names passed to this tool should be in snake_case, as in the examples below.

# date_ranges

Example date_ranges arguments:
1. A single date range:
  [ {"start_date": "2025-01-01", "end_date": "2025-01-31", "name": "Jan2025"} ]

2. A relative date range using 'yesterday' and 'today':
  [ {"start_date": "yesterday", "end_date": "today", "name": "YesterdayAndToday"} ]

3. A relative date range using 'NdaysAgo' and 'today':
  [ {"start_date": "30daysAgo", "end_date": "yesterday", "name": "Previous30Days"} ]

4. Multiple date ranges:
  [ {"start_date": "2025-01-01", "end_date": "2025-01-31", "name": "Jan2025"}, {"start_date": "2025-02-01", "end_date": "2025-02-28", "name": "Feb2025"} ]

# dimension_filter

Example dimension_filter arguments:
1. A simple filter:
  {"filter": {"field_name": "eventName", "string_filter": {"match_type": "BEGINS_WITH", "value": "add"}}}

2. A NOT filter:
  {"not_expression": {"filter": {"field_name": "eventName", "string_filter": {"match_type": "BEGINS_WITH", "value": "add"}}}}

3. An empty value filter:
  {"filter": {"field_name": "source", "empty_filter": {}}}

4. An AND group filter:
  {"and_group": {"expressions": [{"filter": {"field_name": "sourceMedium", "string_filter": {"match_type": "EXACT", "value": "google / cpc"}}}, {"filter": {"field_name": "eventName", "in_list_filter": {"case_sensitive": true, "values": ["first_visit", "purchase", "add_to_cart"]}}}]}}

5. An OR group filter:
  {"or_group": {"expressions": [{"filter": {"field_name": "sourceMedium", "string_filter": {"match_type": "EXACT", "value": "google / cpc"}}}, {"filter": {"field_name": "eventName", "in_list_filter": {"case_sensitive": true, "values": ["first_visit", "purchase", "add_to_cart"]}}}]}}

{{filter_notes}}

# metric_filter

Example metric_filter arguments:
1. A simple filter:
  {"filter": {"field_name": "eventCount", "numeric_filter": {"operation": "GREATER_THAN", "value": {"int64_value": "10"}}}}

2. A NOT filter:
  {"not_expression": {"filter": {"field_name": "eventCount", "numeric_filter": {"operation": "GREATER_THAN", "value": {"int64_value": "10"}}}}}

3. An empty value filter:
  {"filter": {"field_name": "purchaseRevenue", "empty_filter": {}}}

4. An AND group filter:
  {"and_group": {"expressions": [{"filter": {"field_name": "eventCount", "numeric_filter": {"operation": "GREATER_THAN", "value": {"int64_value": "10"}}}}, {"filter": {"field_name": "purchaseRevenue", "between_filter": {"from_value": {"double_value": 10.0}, "to_value": {"double_value": 25.0}}}}]}}

5. An OR group filter:
  {"or_group": {"expressions": [{"filter": {"field_name": "eventCount", "numeric_filter": {"operation": "GREATER_THAN", "value": {"int64_value": "10"}}}}, {"filter": {"field_name": "purchaseRevenue", "between_filter": {"from_value": {"double_value": 10.0}, "to_value": {"double_value": 25.0}}}}]}}

{{filter_notes}}

# filter_notes

Notes:
The API applies the `dimension_filter` and `metric_filter` independently. As a result, some complex combinations of dimension and metric filters are not possible in a single report request.

For example, you can't create a `dimension_filter` and `metric_filter` combination for the following condition:

  ((eventName = "page_view" AND eventCount > 100) OR (eventName = "join_group" AND eventCount < 50))

This isn't possible because there's no way to apply the condition "eventCount > 100" only to the data with eventName of "page_view", and the condition "eventCount < 50" only to the data with eventName of "join_group".

More generally, you can't define a `dimension_filter` and `metric_filter` for:

  (((dimension condition D1) AND (metric condition M1)) OR ((dimension condition D2) AND (metric condition M2)))

If you have complex conditions like this, either:

a) Run a single report that applies a subset of the conditions that the API supports as well as the data needed to perform filtering of the API response on the client side. For example, for the condition above, you could run a report that filters only on eventName one of "page_view" or "join_group" and include the eventCount metric, then filter the API response on the client side to apply the different metric filters for the different events.

or

b) Run a separate report for each combination of dimension condition and metric condition. For the example above, you'd run one report for the combination of (D1 AND M1), and another report for the combination of (D2 AND M2).

Try to run fewer reports (option a) if possible. However, if running fewer reports results in excessive quota usage for the API, use option b. More information on quota usage is at https://developers.google.com/analytics/blog/2023/data-api-quota-management.

# order_bys

Example order_bys arguments:
1. Order by ascending 'eventName':
  [ {"dimension": {"dimension_name": "eventName", "order_type": "ALPHANUMERIC"}, "desc": false} ]

2. Order by descending 'campaignName', ignoring case:
  [ {"dimension": {"dimension_name": "campaignName", "order_type": "CASE_INSENSITIVE_ALPHANUMERIC"}, "desc": true} ]

3. Order by ascending 'audienceId':
  [ {"dimension": {"dimension_name": "audienceId", "order_type": "NUMERIC"}, "desc": false} ]

4. Order by descending 'eventValue':
  [ {"metric": {"metric_name": "eventValue"}, "desc": true} ]

5. Order by ascending 'eventCount':
  [ {"metric": {"metric_name": "eventCount"}, "desc": false} ]

6. Combination of dimension and metric order bys:
  [ {"dimension": {"dimension_name": "eventName", "order_type": "ALPHANUMERIC"}, "desc": false}, {"metric": {"metric_name": "eventValue"}, "desc": true} ]

7. Order by multiple dimensions and metrics:
  [ {"dimension": {"dimension_name": "eventName", "order_type": "ALPHANUMERIC"}, "desc": false}, {"dimension": {"dimension_name": "audienceId", "order_type": "NUMERIC"}, "desc": false}, {"metric": {"metric_name": "eventValue"}, "desc": true} ]

The dimensions and metrics in order_bys must also be present in the report request's "dimensions" and "metrics" arguments, respectively.
