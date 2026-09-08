# app/api/chat

`route.ts` — the RAG chat endpoint (`POST /api/chat`):

1. If the conversation has any prior assistant turns, condenses history + the
   new question into a standalone search query via `rewriteQuery()`
   (`lib/query-rewrite.ts`) — one cheap non-streaming call, skipped entirely
   on the first turn of a conversation.
2. Runs the agent loop (`lib/agent.ts`), passing that query as a `searchHint`:
   the model calls the `search_documents` tool (`lib/tools.ts`) against the
   Databricks Vector Search Delta Sync index as many times as it needs —
   reranking and a relevance floor run inside the tool — until it stops
   requesting searches or a 5-iteration cap is hit.
3. Streams the final answer from the Databricks Foundation Model serving
   endpoint (Llama 3.3 70B) over the full tool-call conversation, no tools
   attached.

Response framing: the first streamed line is a JSON object `{ "sources": [...], "retrieval": {...} }` with the deduplicated citations from every tool call, followed by the answer text streamed token-by-token. `retrieval.originalQuery` is the raw last user message, `retrieval.searchQuery` is what was actually sent to the agent, and `retrieval.rewritten` is `true` only when a rewrite fired. Reranking behavior is controlled by the `RAG_*` env vars documented in the root README.
