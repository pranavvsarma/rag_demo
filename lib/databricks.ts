// Server-only Databricks client. This module must never be imported into a
// Client Component — it reads the PAT from the environment and talks to the
// Databricks REST APIs directly. All calls go through the Next.js API route.

const HOST = (process.env.DATABRICKS_HOST || "").replace(/\/+$/, "");
const TOKEN = process.env.DATABRICKS_TOKEN || "";
const INDEX = process.env.DATABRICKS_VS_INDEX || "";
const CHAT_ENDPOINT = process.env.DATABRICKS_CHAT_ENDPOINT || "";
// Unity Catalog Volume where uploaded CSVs are persisted, e.g.
// /Volumes/rag_demo/docs/source_files . Datasets go in a `datasets/` subfolder.
const VOLUME_PATH = (process.env.DATABRICKS_VOLUME_PATH || "").replace(
  /\/+$/,
  ""
);

export interface Source {
  id: string;
  text: string;
  source: string;
  /** Vector Search similarity score returned by the index. */
  score: number;
  /** 0-10 usefulness score from the LLM reranker; absent when reranking is off or failed. */
  rerankScore?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  };
}

/**
 * Query the Databricks Vector Search index by text. Because the index was
 * built with Databricks-computed (GTE) embeddings, we send `query_text` and
 * Databricks embeds it server-side — the app never touches an embedding model.
 */
export async function retrieve(
  query: string,
  numResults = 5,
  signal?: AbortSignal
): Promise<Source[]> {
  if (!HOST || !TOKEN || !INDEX) {
    throw new Error(
      "Databricks env vars missing. Set DATABRICKS_HOST, DATABRICKS_TOKEN and DATABRICKS_VS_INDEX in .env.local"
    );
  }

  const url = `${HOST}/api/2.0/vector-search/indexes/${INDEX}/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      columns: ["id", "text", "source"],
      query_text: query,
      num_results: numResults,
    }),
    signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Vector Search query failed (${res.status}): ${detail}`);
  }

  const data = await res.json();
  const cols: string[] = (data?.manifest?.columns ?? []).map(
    (c: { name: string }) => c.name
  );
  const rows: unknown[][] = data?.result?.data_array ?? [];

  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    cols.forEach((c, i) => (obj[c] = row[i]));
    // Databricks appends the similarity score as the final column.
    const last = row[row.length - 1];
    const score = typeof last === "number" ? last : 0;
    return {
      id: String(obj.id ?? ""),
      text: String(obj.text ?? ""),
      source: String(obj.source ?? ""),
      score,
    };
  });
}

/**
 * Call the Databricks Foundation Model serving endpoint with streaming
 * enabled. Databricks endpoints are OpenAI-compatible and return
 * Server-Sent Events (`data: {json}\n\n`). Returns the raw upstream Response
 * so the caller can parse the SSE stream.
 */
export async function chatCompletionStream(
  messages: ChatMessage[]
): Promise<Response> {
  if (!HOST || !TOKEN || !CHAT_ENDPOINT) {
    throw new Error(
      "Databricks env vars missing. Set DATABRICKS_HOST, DATABRICKS_TOKEN and DATABRICKS_CHAT_ENDPOINT in .env.local"
    );
  }

  const url = `${HOST}/serving-endpoints/${CHAT_ENDPOINT}/invocations`;
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      messages,
      max_tokens: 800,
      temperature: 0.2,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Chat endpoint failed (${res.status}): ${detail}`);
  }

  return res;
}

/**
 * Non-streaming completion. Used by the CSV-chat route, which needs the full
 * response text in one piece so it can parse the model's JSON envelope.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number; signal?: AbortSignal } = {}
): Promise<string> {
  if (!HOST || !TOKEN || !CHAT_ENDPOINT) {
    throw new Error(
      "Databricks env vars missing. Set DATABRICKS_HOST, DATABRICKS_TOKEN and DATABRICKS_CHAT_ENDPOINT in .env.local"
    );
  }

  const { maxTokens = 800, temperature = 0, signal } = opts;
  const url = `${HOST}/serving-endpoints/${CHAT_ENDPOINT}/invocations`;
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: false,
    }),
    signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Chat endpoint failed (${res.status}): ${detail}`);
  }

  const data = await res.json();
  return String(data?.choices?.[0]?.message?.content ?? "");
}

/**
 * Persist an uploaded dataset to the Unity Catalog Volume via the Files API.
 * The Files API works on Volumes without any running cluster or SQL warehouse,
 * so this stays within Databricks Free Edition compute limits. Files land in
 * `<VOLUME_PATH>/datasets/<name>`.
 */
export async function uploadDatasetFile(
  name: string,
  bytes: ArrayBuffer
): Promise<string> {
  if (!HOST || !TOKEN || !VOLUME_PATH) {
    throw new Error(
      "Databricks env vars missing. Set DATABRICKS_HOST, DATABRICKS_TOKEN and DATABRICKS_VOLUME_PATH in .env.local"
    );
  }

  // Keep the filename safe; the folder path is fixed and trusted.
  const safeName = name.replace(/[^\w.\- ]+/g, "_");
  const objectPath = `${VOLUME_PATH}/datasets/${safeName}`;
  const encoded = objectPath
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  const url = `${HOST}/api/2.0/fs/files${encoded}?overwrite=true`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/octet-stream",
    },
    body: bytes,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Volume upload failed (${res.status}): ${detail}`);
  }

  return objectPath;
}
