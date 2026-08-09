# app/api/datasets

Dataset catalog CRUD, backed by the Databricks Files API over a Unity Catalog Volume (`catalog.json` as the index, no cluster/warehouse required).

- `route.ts` — `GET` search/list the catalog · `POST` upload a new dataset (5 MB cap).
- `[id]/route.ts` — `GET` metadata plus a page of parsed rows · `DELETE` remove a dataset.
- `[id]/aggregate/` — server-side group-by + aggregate over the real rows (same "model never does arithmetic" invariant as `/api/data`).
- `[id]/download/` — always returns CSV (JSON-sourced datasets are flattened first).
