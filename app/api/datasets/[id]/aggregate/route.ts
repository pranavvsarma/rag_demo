import { getDataset, readDatasetFile } from "@/lib/catalog";
import { aggregateSeries, isAgg, parseTable } from "@/lib/table";
import type { NextRequest } from "next/server";

// Talks to Databricks (network + secrets); must run on Node and never cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/datasets/[id]/aggregate?x=&y=&agg= — group rows by `x` and
 * aggregate `y`, returning the series the chart renders. The math is done here
 * over the real rows, so the numbers are exact.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/datasets/[id]/aggregate">
) {
  try {
    const { id } = await ctx.params;
    const meta = await getDataset(id);
    if (!meta) {
      return Response.json({ error: "Dataset not found." }, { status: 404 });
    }

    const params = request.nextUrl.searchParams;
    const x = params.get("x") ?? "";
    const y = params.get("y") ?? "";
    const aggParam = params.get("agg") ?? "sum";

    if (!isAgg(aggParam)) {
      return Response.json(
        { error: `Unsupported aggregation "${aggParam}".` },
        { status: 400 }
      );
    }

    const names = new Set(meta.columns.map((c) => c.name));
    if (!names.has(x)) {
      return Response.json(
        { error: `Unknown column "${x}".` },
        { status: 400 }
      );
    }
    // "count" tallies rows per group, so it doesn't need a Y column.
    if (aggParam !== "count" && !names.has(y)) {
      return Response.json(
        { error: `Unknown column "${y}".` },
        { status: 400 }
      );
    }

    const table = parseTable(await readDatasetFile(meta), meta.format);
    return Response.json({
      series: aggregateSeries(table.rows, x, y, aggParam),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Aggregation failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
