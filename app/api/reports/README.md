# app/api/reports

Saved chart configs, stored as `reports.json` in the same Unity Catalog Volume as the dataset catalog.

- `route.ts` — `GET` all saved reports · `POST` save a chart config.
- `[id]/route.ts` — `DELETE` a saved report.
