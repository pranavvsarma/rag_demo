import { uploadDatasetFile } from "@/lib/databricks";

// Talks to Databricks (network + secrets); must run on Node and never cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Persist an uploaded CSV to the Databricks Volume. The browser has already
 * parsed the file for charting; this call is purely for cross-session storage.
 * Accepts multipart/form-data with a single `file` field.
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return Response.json(
        { error: "No file provided." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const path = await uploadDatasetFile(file.name, bytes);

    return Response.json({ ok: true, path });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
