import type { Metadata } from "next";
import { ExplorerShell } from "./components/ExplorerShell";

// Page-level metadata (title/description) for the /explorer route.
export const metadata: Metadata = {
  title: "Data Explorer · Databricks",
  description:
    "Upload, preview, chart and download datasets stored in a Databricks Unity Catalog Volume.",
};

/**
 * The `/explorer` route: Data Explorer feature for browsing, uploading,
 * charting and downloading datasets stored in a Databricks Volume.
 * All actual state/UI logic lives in `ExplorerShell`; this page just
 * supplies the route's layout wrapper (full-height flex column) and metadata.
 */
export default function ExplorerPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <ExplorerShell />
    </div>
  );
}
