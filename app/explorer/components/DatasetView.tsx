"use client";

import { useState } from "react";
import type { ChartConfig, DatasetMeta } from "@/lib/catalog";
import { ChartBuilder } from "./ChartBuilder";
import { PreviewTable } from "./PreviewTable";

type Tab = "preview" | "visualize";

interface Props {
  dataset: DatasetMeta;
  /** Set when the user opened a saved report; starts on the Visualize tab. */
  pendingChart: ChartConfig | null;
  onSaveReport: (name: string, chart: ChartConfig) => Promise<unknown>;
}

/**
 * The parent remounts this component (via `key`) on every selection change, so
 * the starting tab is an initial state rather than an effect: opening a saved
 * report lands directly on the chart.
 */
export function DatasetView({ dataset, pendingChart, onSaveReport }: Props) {
  const [tab, setTab] = useState<Tab>(pendingChart ? "visualize" : "preview");

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

        <a
          href={`/api/datasets/${dataset.id}/download`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-black/[0.04] dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/[0.06]"
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
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M7 10l5 5 5-5" />
            <path d="M12 15V3" />
          </svg>
          Download CSV
        </a>
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
            onSaveReport={onSaveReport}
          />
        )}
      </div>
    </div>
  );
}
