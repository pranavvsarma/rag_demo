import { addDataset, listDatasets, writeDatasetFile } from "@/lib/catalog";
import type { DatasetMeta } from "@/lib/catalog";
import { parseTable, type DatasetFormat } from "@/lib/table";
import type { NextRequest } from "next/server";

// Talks to Databricks (network + secrets); must run on Node and never cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Parsing happens in-process, so cap uploads to keep Node memory bounded.
const MAX_BYTES = 5 * 1024 * 1024;

/** GET /api/datasets?q= — search the catalog by name, description or tag. */
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q") ?? undefined;
    return Response.json({ datasets: await listDatasets(q) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load catalog";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/datasets — multipart/form-data upload.
 * Fields: `file` (required), `name`, `description`, `tags` (comma-separated).
 * Stores the raw file in the Volume and appends a catalog entry.
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "No file provided." }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "csv" && ext !== "json") {
      return Response.json(
        { error: "Only .csv and .json files are supported." },
        { status: 400 }
      );
    }
    const format: DatasetFormat = ext;

    if (file.size > MAX_BYTES) {
      return Response.json(
        { error: `File is too large (max ${MAX_BYTES / 1024 / 1024} MB).` },
        { status: 400 }
      );
    }

    const text = await file.text();

    // Parse up front so a malformed file is rejected before anything is stored.
    let columns;
    let rowCount;
    try {
      const table = parseTable(text, format);
      columns = table.columns;
      rowCount = table.rows.length;
    } catch (e) {
      const detail = e instanceof Error ? e.message : "could not be parsed";
      return Response.json(
        { error: `Could not parse that file: ${detail}` },
        { status: 400 }
      );
    }

    if (columns.length === 0) {
      return Response.json(
        { error: "No columns found in that file." },
        { status: 400 }
      );
    }

    const meta: DatasetMeta = {
      id: crypto.randomUUID(),
      name: String(form.get("name") || "").trim() || file.name,
      description: String(form.get("description") || "").trim(),
      format,
      tags: String(form.get("tags") || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      columns,
      rowCount,
      sizeBytes: file.size,
      uploadedAt: new Date().toISOString(),
    };

    await writeDatasetFile(meta, text);
    await addDataset(meta);

    return Response.json({ dataset: meta }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
