# lib

Shared server- and client-side logic used by both the chat and Data Explorer routes.

- `databricks.ts` — server-only Databricks REST client (Vector Search + Foundation Model calls).
- `volume.ts` — server-only Files API client over the Unity Catalog Volume.
- `catalog.ts` — dataset + report index, stored as JSON (`catalog.json`, `reports.json`) in the Volume.
- `table.ts` — server-side CSV parsing, type inference, aggregation, and `toCsv` serialization.
- `csv.ts` — browser-side parsing, summarizing, aggregating, and computing over CSV data attached in chat.
- `chart-types.ts` — chart vocabulary shared between client and server.
- `chart-export.ts` — SVG → canvas → PNG export, including a hand-painted legend.
- `report-pdf.ts` — builds a PDF report: title block + chart image + data table (jsPDF + jspdf-autotable).
