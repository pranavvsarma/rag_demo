# Databricks RAG · Chat with your docs

A retrieval-augmented-generation (RAG) chat app. Ask questions about your own
documents and get grounded, cited answers streamed token-by-token. Retrieval
runs on **Databricks Vector Search**; generation runs on a **Databricks
Foundation Model serving endpoint** (Llama 3.3 70B). The frontend is **Next.js
16 (App Router) + React 19**.

---

## Architecture

```
┌─────────────────────────────┐
│  Browser (React 19)          │
│  - ChatWindow / MessageList  │
│  - useChat() custom hook     │   fetch("/api/chat")  (streamed)
│    reads the streamed body   │───────────────┐
└──────────────────────────────┘               │
                                                ▼
┌───────────────────────────────────────────────────────────────┐
│  Next.js Route Handler  app/api/chat/route.ts  (server, Node)  │
│  Backend-for-frontend — holds the Databricks PAT, never the UI │
│                                                                 │
│  1. retrieve(query)   ── POST /api/2.0/vector-search/.../query  │
│  2. build grounded prompt (system rules + retrieved context)    │
│  3. chatCompletionStream(messages)                              │
│        ── POST /serving-endpoints/<model>/invocations (stream)  │
│  4. stream back:  line 1 = sources JSON, then answer tokens     │
└───────────────────────────────────────────────────────────────┘
                                                │
                                                ▼
┌───────────────────────────────────────────────────────────────┐
│  Databricks Free Edition                                        │
│  • Delta table  rag_demo.docs.doc_chunks  (chunked docs)        │
│  • Vector Search Delta Sync index (GTE embeddings, server-side) │
│  • Foundation Model endpoint: databricks-meta-llama-3-3-70b     │
└───────────────────────────────────────────────────────────────┘
```

Because the index uses **Databricks-computed (GTE) embeddings**, the app queries
Vector Search with plain **text** — Databricks embeds the query server-side, so
the app never calls an embedding model itself. Two Databricks REST calls per
question: one to retrieve, one to generate.

---

## Tech stack

| Layer        | Tech                                                        |
| ------------ | ----------------------------------------------------------- |
| UI           | React 19 components, Tailwind CSS v4                         |
| Framework    | Next.js 16 (App Router, Route Handlers)                     |
| Streaming    | Custom `useChat` hook over `fetch` + `ReadableStream`       |
| Retrieval    | Databricks Vector Search (Delta Sync index, GTE embeddings) |
| Generation   | Databricks Foundation Model API — Llama 3.3 70B (streaming) |
| Data prep    | Databricks notebook: load → chunk → Delta table → index     |

---

## Project structure

```
app/
  api/chat/route.ts       BFF: retrieve → prompt → stream generation
  components/
    ChatWindow.tsx        Wires the hook to the UI
    MessageList.tsx       Message stream + auto-scroll + empty state
    MessageBubble.tsx     User/assistant bubbles, streaming cursor
    ChatInput.tsx         Auto-growing textarea, Enter-to-send
    Sources.tsx           Collapsible retrieved-chunk citations
  hooks/useChat.ts        Conversation state + stream consumption
  page.tsx / layout.tsx   Shell
lib/databricks.ts         Server-only Databricks REST client
```

---

## Setup

### 1. Databricks backend (one-time, in a Databricks notebook)

The notebook pipeline: load documents from a Unity Catalog Volume → chunk them →
write a Delta table `rag_demo.docs.doc_chunks` (with Change Data Feed enabled) →
create a Vector Search endpoint → create a Delta Sync index using the
`databricks-gte-large-en` embedding endpoint.

### 2. Environment

`.env.local` (already gitignored — never committed):

```bash
DATABRICKS_HOST=https://<your-workspace>.cloud.databricks.com
DATABRICKS_TOKEN=<personal-access-token>
DATABRICKS_VS_ENDPOINT=rag_demo_endpoint
DATABRICKS_VS_INDEX=rag_demo.docs.doc_chunks_index
DATABRICKS_CHAT_ENDPOINT=databricks-meta-llama-3-3-70b-instruct
```

### 3. Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

---

## How the streaming works

The route returns a single streamed response with a tiny framing protocol:

- **First line**: a JSON object `{ "sources": [...] }` — the retrieved chunks.
- **Everything after**: the answer text, streamed token-by-token.

`useChat` reads the body with a `ReadableStream` reader: it splits off the first
line to render the citation panel immediately, then appends every subsequent
chunk to the assistant message so text appears as it is generated.

---

## Interview talking points

- **Why a Next.js Route Handler (BFF)?** The Databricks PAT lives only on the
  server. The browser never sees it — it only talks to `/api/chat`. This is the
  correct full-stack security boundary.
- **Why a self-written `useChat` instead of a library?** So the streaming is
  understood end to end: `fetch` → `ReadableStream` reader → incremental
  `setState`. Exercises `useState`, `useRef`, `useCallback`, optimistic UI, and
  cancellation via `AbortController`.
- **Why Databricks-computed embeddings?** The Delta Sync index embeds both the
  documents and the query with the same GTE model server-side, so the app stays
  a thin client and retrieval quality is consistent.
- **Grounding & citations.** The system prompt restricts the model to the
  retrieved context and asks it to cite source filenames; the UI surfaces the
  exact chunks (with similarity scores) that produced each answer.
- **Free Edition constraints handled.** One Vector Search endpoint; Delta Sync
  (not Direct Vector Access, which Free Edition doesn't support); pay-per-token
  Foundation Model endpoints for both embeddings and chat.

---

## Notes

- The PAT in `.env.local` should be rotated/revoked when the project is done.
- Retrieved PDF text may have spacing artifacts from PDF extraction; this does
  not affect retrieval and the model still answers correctly, but a higher-
  quality extractor (e.g. PyMuPDF) would clean it up.
