# lib

Shared server- and client-side logic used by both the chat and Data Explorer routes.

- `databricks.ts` — server-only Databricks REST client (Vector Search + Foundation Model calls, including the tool-calling variant used by the agent loop).
- `agent.ts` — ReAct-style agent loop: offers the `search_documents` tool until the model stops requesting it, or a 5-iteration cap is hit. Takes an optional `searchHint` string appended to the system prompt to prime the first search.
- `query-rewrite.ts` — condenses `(history + new question)` into a standalone search query for follow-up turns, via one cheap non-streaming `chatCompletion` call; falls back to the raw question on the first turn or on any failure. Separate from — and not to be confused with — `rag.ts`'s unused `condenseQuery`.
- `tools.ts` — tool registry; `search_documents` wraps `retrieve` + `rerank` + relevance floor into one model-facing tool.
- `rag.ts` — rerank + relevance-floor stages, called from `tools.ts`. Also holds `condenseQuery`/`runRetrievalPipeline` from the pre-agent fixed pipeline, which nothing calls anymore.
- `volume.ts` — server-only Files API client over the Unity Catalog Volume.
- `catalog.ts` — dataset + report index, stored as JSON (`catalog.json`, `reports.json`) in the Volume.
- `table.ts` — server-side CSV parsing, type inference, aggregation, and `toCsv` serialization.
- `csv.ts` — browser-side parsing, summarizing, aggregating, and computing over CSV data attached in chat.
- `chart-types.ts` — chart vocabulary shared between client and server.
- `chart-export.ts` — SVG → canvas → PNG export, including a hand-painted legend.
- `report-pdf.ts` — builds a PDF report: title block + chart image + data table (jsPDF + jspdf-autotable).
