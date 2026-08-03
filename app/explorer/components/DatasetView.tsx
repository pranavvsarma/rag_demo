"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { ChartConfig, DatasetMeta } from "@/lib/catalog";
import { ChartBuilder } from "./ChartBuilder";
import { PreviewTable } from "./PreviewTable";

type Tab = "preview" | "visualize";

interface Props {
  dataset: DatasetMeta;
  /** Set when the user opened a saved report; starts on the Visualize tab. */
  pendingChart: ChartConfig | null;
  /** Name of that saved report, for the exported PDF's headline. */
  pendingReportName?: string | null;
  onSaveReport: (name: string, chart: ChartConfig) => Promise<unknown>;
}

/**
 * The parent remounts this component (via `key`) on every selection change, so
 * the starting tab is an initial state rather than an effect: opening a saved
 * report lands directly on the chart.
 */
export function DatasetView({
  dataset,
  pendingChart,
  pendingReportName,
  onSaveReport,
}: Props) {
  const [tab, setTab] = useState<Tab>(pendingChart ? "visualize" : "preview");

  // Published by ChartBuilder while a chart is on screen; null on the Preview
  // tab, where there is no chart to put in the report.
  const [runReport, setRunReport] = useState<(() => Promise<void>) | null>(null);
  const [building, setBuilding] = useState(false);

  // Stable, so ChartBuilder's registration effect runs on readiness alone.
  const registerReport = useCallback(
    (run: (() => Promise<void>) | null) => setRunReport(() => run),
    []
  );

  async function downloadReport() {
    if (!runReport) return;
    setBuilding(true);
    try {
      await runReport(); // ChartBuilder surfaces any failure in its own banner
    } finally {
      setBuilding(false);
    }
  }

  function tabClass(t: Tab) {
    return `rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
      tab === t
        ? "bg-black/[0.06] text-zinc-900 dark:bg-white/10 dark:text-zinc-100"
        : "text-zinc-500 hover:bg-black/[0.03] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-zinc-100"
    }`;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-black/10 px-4 py-3 dark:border-white/10">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {dataset.name}
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {dataset.format.toUpperCase()} · {dataset.rowCount.toLocaleString()} rows ·{" "}
            {dataset.columns.length} columns
          </p>
          {dataset.description && (
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              {dataset.description}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/?dataset=${dataset.id}`}
            title="Open this dataset in chat and ask questions about it"
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-black/[0.04] dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/[0.06]"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Ask in chat
          </Link>

          <button
            onClick={downloadReport}
            disabled={!runReport || building}
            title={
              runReport
                ? "Download a PDF report with the chart and its data table"
                : "Build a chart on the Visualize tab first"
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-black/[0.04] disabled:opacity-40 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/[0.06]"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M9 13h6" />
              <path d="M9 17h6" />
            </svg>
            {building ? "Building…" : "Download report"}
          </button>
        </div>
      </header>

      <nav className="flex gap-1 px-4 pt-3">
        <button onClick={() => setTab("preview")} className={tabClass("preview")}>
          Preview
        </button>
        <button onClick={() => setTab("visualize")} className={tabClass("visualize")}>
          Visualize
        </button>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "preview" ? (
          <PreviewTable datasetId={dataset.id} />
        ) : (
          <ChartBuilder
            dataset={dataset}
            initialChart={pendingChart}
            reportTitle={pendingReportName}
            onSaveReport={onSaveReport}
            onExportReport={registerReport}
          />
        )}
      </div>
    </div>
  );
}
