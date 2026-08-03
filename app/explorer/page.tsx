import type { Metadata } from "next";
import { ExplorerShell } from "./components/ExplorerShell";

export const metadata: Metadata = {
  title: "Data Explorer · Databricks",
  description:
    "Upload, preview, chart and download datasets stored in a Databricks Unity Catalog Volume.",
};

export default function ExplorerPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <ExplorerShell />
    </div>
  );
}
