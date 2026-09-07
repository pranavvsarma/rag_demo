# app/api/chat

`route.ts` — the RAG chat endpoint (`POST /api/chat`):

1. Runs the agent loop (`lib/agent.ts`): the model calls the `search_documents`
   tool (`lib/tools.ts`) against the Databricks Vector Search Delta Sync index
   as many times as it needs — reranking and a relevance floor run inside the
   tool — until it stops requesting searches or a 5-iteration cap is hit.
2. Streams the final answer from the Databricks Foundation Model serving
   endpoint (Llama 3.3 70B) over the full tool-call conversation, no tools
   attached.

Response framing: the first streamed line is a JSON object `{ "sources": [...], "retrieval": {...} }` with the deduplicated citations from every tool call, followed by the answer text streamed token-by-token. Reranking behavior is controlled by the `RAG_*` env vars documented in the root README.
