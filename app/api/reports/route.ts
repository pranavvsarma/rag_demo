import { addReport, getDataset, listReports } from "@/lib/catalog";
import type { Report } from "@/lib/catalog";
import { isChartType } from "@/lib/chart-types";
import { isAgg } from "@/lib/table";

// Talks to Databricks (network + secrets); must run on Node and never cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/reports — all saved reports, newest first. */
export async function GET() {
  try {
    return Response.json({ reports: await listReports() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load reports";
    return Response.json({ error: message }, { status: 500 });
  }
}

/** POST /api/reports — save a chart configuration as a named report. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body?.name ?? "").trim();
    const datasetId = String(body?.datasetId ?? "");
    const chart = body?.chart ?? {};

    if (!name) {
      return Response.json({ error: "A report name is required." }, { status: 400 });
    }

    const dataset = await getDataset(datasetId);
    if (!dataset) {
      return Response.json({ error: "Dataset not found." }, { status: 400 });
    }

    const type = String(chart?.type ?? "");
    const agg = String(chart?.agg ?? "");
    const x = String(chart?.x ?? "");
    const y = String(chart?.y ?? "");

    if (!isChartType(type)) {
      return Response.json({ error: `Unsupported chart type "${type}".` }, { status: 400 });
    }
    if (!isAgg(agg)) {
      return Response.json({ error: `Unsupported aggregation "${agg}".` }, { status: 400 });
    }

    // Validate against the stored schema so a saved report can always re-open.
    const names = new Set(dataset.columns.map((c) => c.name));
    if (!names.has(x) || (agg !== "count" && !names.has(y))) {
      return Response.json(
        { error: "Chart columns are not in this dataset." },
        { status: 400 }
      );
    }

    const report: Report = {
      id: crypto.randomUUID(),
      name,
      datasetId,
      chart: { type, x, y, agg },
      createdAt: new Date().toISOString(),
    };

    await addReport(report);
    return Response.json({ report }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save report";
    return Response.json({ error: message }, { status: 500 });
  }
}
