# app/api/chat

`route.ts` — the RAG chat endpoint (`POST /api/chat`):

1. Retrieves relevant chunks from the Databricks Vector Search Delta Sync index (plain-text query — embedding happens server-side in Databricks).
2. Builds a grounded prompt from the retrieved chunks.
3. Streams the generation from the Databricks Foundation Model serving endpoint (Llama 3.3 70B).

Response framing: the first streamed line is a JSON object `{ "sources": [...] }` with the retrieved citations, followed by the answer text streamed token-by-token. Retrieval/rerank behavior (query rewrite, reranking, abstain-when-irrelevant, top-k, score floor) is controlled by the `RAG_*` env vars documented in the root README.
