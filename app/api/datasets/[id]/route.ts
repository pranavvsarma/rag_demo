import { deleteDataset, getDataset, readDatasetFile } from "@/lib/catalog";
import { parseTable } from "@/lib/table";
import type { NextRequest } from "next/server";

// Talks to Databricks (network + secrets); must run on Node and never cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Route for the Data Explorer's dataset detail view: paginated row preview
// (GET) and dataset removal (DELETE).

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

/** Parse+clamp a query-string int param, falling back to `fallback` if missing/invalid. */
function intParam(v: string | null, fallback: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}

/**
 * GET /api/datasets/[id]?page=&pageSize= — paginated preview.
 * The file is re-fetched and re-parsed per request; fine for the small personal
 * datasets this app targets (uploads are size-capped).
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/datasets/[id]">
) {
  try {
    const { id } = await ctx.params;
    const meta = await getDataset(id);
    if (!meta) {
      return Response.json({ error: "Dataset not found." }, { status: 404 });
    }

    const params = request.nextUrl.searchParams;
    const page = intParam(params.get("page"), 1, Number.MAX_SAFE_INTEGER);
    const pageSize = intParam(
      params.get("pageSize"),
      DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE
    );

    const table = parseTable(await readDatasetFile(meta), meta.format);
    const start = (page - 1) * pageSize;

    return Response.json({
      meta,
      columns: table.columns,
      rows: table.rows.slice(start, start + pageSize),
      total: table.rows.length,
      page,
      pageSize,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load dataset";
    return Response.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/datasets/[id] — remove the file, catalog entry and its reports. */
export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/datasets/[id]">
) {
  try {
    const { id } = await ctx.params;
    const removed = await deleteDataset(id);
    if (!removed) {
      return Response.json({ error: "Dataset not found." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
