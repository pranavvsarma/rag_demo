// Server-only client for the Databricks Files API over a Unity Catalog Volume.
// This module must never be imported into a Client Component — it reads the PAT
// from the environment.
//
// The Files API operates on Volumes without any running cluster or SQL
// warehouse, so the Data Explorer stores raw dataset files plus small JSON
// index files here and burns no Databricks compute. All parsing and
// aggregation happens in the Next.js Node runtime (see lib/table.ts).

const HOST = (process.env.DATABRICKS_HOST || "").replace(/\/+$/, "");
const TOKEN = process.env.DATABRICKS_TOKEN || "";
// Root of the Data Explorer volume, e.g. /Volumes/rag_demo/docs/data_explorer
const VOLUME = (process.env.DATABRICKS_VOLUME_DATA_EXPLORER || "").replace(
  /\/+$/,
  ""
);

/** Absolute Volume path for a file inside the Data Explorer root. */
export function volumePath(...segments: string[]): string {
  return [VOLUME, ...segments].join("/");
}

function assertConfigured() {
  if (!HOST || !TOKEN || !VOLUME) {
    throw new Error(
      "Databricks env vars missing. Set DATABRICKS_HOST, DATABRICKS_TOKEN and DATABRICKS_VOLUME_DATA_EXPLORER in .env.local"
    );
  }
}

/** The Files API takes the literal Volume path in the URL, segment-encoded. */
function fileUrl(absPath: string): string {
  const encoded = absPath.split("/").map(encodeURIComponent).join("/");
  return `${HOST}/api/2.0/fs/files${encoded}`;
}

function authHeader() {
  return { Authorization: `Bearer ${TOKEN}` };
}

/** Upload (or overwrite) a file. */
export async function putFile(
  absPath: string,
  body: ArrayBuffer | string
): Promise<void> {
  assertConfigured();
  const res = await fetch(`${fileUrl(absPath)}?overwrite=true`, {
    method: "PUT",
    headers: { ...authHeader(), "Content-Type": "application/octet-stream" },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Volume upload failed (${res.status}): ${detail}`);
  }
}

/** Download a file as text. Returns null when it doesn't exist. */
export async function getFileText(absPath: string): Promise<string | null> {
  assertConfigured();
  const res = await fetch(fileUrl(absPath), { headers: authHeader() });
  if (res.status === 404) return null;
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Volume download failed (${res.status}): ${detail}`);
  }
  return res.text();
}

/** Delete a file. A missing file is treated as success (idempotent). */
export async function deleteFile(absPath: string): Promise<void> {
  assertConfigured();
  const res = await fetch(fileUrl(absPath), {
    method: "DELETE",
    headers: authHeader(),
  });
  if (!res.ok && res.status !== 404) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Volume delete failed (${res.status}): ${detail}`);
  }
}

/**
 * Read a JSON index file, falling back to `fallback` when it is missing or
 * unparseable. The index files are created lazily on first write, so a 404 on
 * a fresh Volume is expected rather than an error.
 */
export async function readJson<T>(absPath: string, fallback: T): Promise<T> {
  const text = await getFileText(absPath);
  if (text === null || text.trim() === "") return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** Write a JSON index file. */
export async function writeJson(
  absPath: string,
  data: unknown
): Promise<void> {
  await putFile(absPath, JSON.stringify(data, null, 2));
}
