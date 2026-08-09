import { getDataset, readDatasetFile } from "@/lib/catalog";
import { parseTable, toCsv } from "@/lib/table";
import type { NextRequest } from "next/server";

// Talks to Databricks (network + secrets); must run on Node and never cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Route for the Data Explorer's "Download" action.
 *
 * GET /api/datasets/[id]/download — always returns CSV. A CSV dataset is
 * served back verbatim; a JSON one is flattened to CSV first. Response is a
 * file download (Content-Disposition: attachment) named after the dataset.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/datasets/[id]/download">
) {
  try {
    const { id } = await ctx.params;
    const meta = await getDataset(id);
    if (!meta) {
      return Response.json({ error: "Dataset not found." }, { status: 404 });
    }

    const text = await readDatasetFile(meta);
    const csv =
      meta.format === "csv"
        ? text
        : (() => {
            const table = parseTable(text, "json");
            return toCsv(table.columns, table.rows);
          })();

    const base = meta.name.replace(/\.(csv|json)$/i, "").replace(/[^\w.\- ]+/g, "_");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base || "dataset"}.csv"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Download failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
