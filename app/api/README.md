# app/api

Route Handlers acting as the backend-for-frontend: the only place that holds the Databricks personal access token, calling Databricks REST APIs on behalf of the browser.

- `chat/` — retrieve → prompt → stream generation over Databricks Vector Search + a Foundation Model endpoint.
- `data/` — LLM *planner* endpoint; returns a `{chart|compute|text}` envelope describing what to compute, never the numbers themselves.
- `datasets/` — CRUD over the Data Explorer's dataset catalog, backed by the Databricks Files API over a Unity Catalog Volume.
- `reports/` — CRUD over saved chart configs.
- `_probe/` — diagnostic-only route, not part of the product surface. See [_probe/README.md](_probe/README.md).
