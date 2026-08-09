import { deleteReport, getReport } from "@/lib/catalog";
import type { NextRequest } from "next/server";

// Route for a single saved report (a saved chart configuration): fetch it
// (GET) or remove it (DELETE). Used by the Data Explorer's reports view.

// Talks to Databricks (network + secrets); must run on Node and never cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/reports/[id] — one saved report. */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/reports/[id]">
) {
  try {
    const { id } = await ctx.params;
    const report = await getReport(id);
    if (!report) {
      return Response.json({ error: "Report not found." }, { status: 404 });
    }
    return Response.json({ report });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load report";
    return Response.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/reports/[id] */
export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/reports/[id]">
) {
  try {
    const { id } = await ctx.params;
    const removed = await deleteReport(id);
    if (!removed) {
      return Response.json({ error: "Report not found." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
