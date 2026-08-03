"use client";

import { useState } from "react";
import type { ChartConfig, DatasetMeta, Report } from "@/lib/catalog";
import { useDatasets } from "../hooks/useDatasets";
import { useReports } from "../hooks/useReports";
import { CatalogList } from "./CatalogList";
import { DatasetView } from "./DatasetView";
import { ReportsList } from "./ReportsList";
import { UploadPanel } from "./UploadPanel";

export function ExplorerShell() {
  const { datasets, query, setQuery, isLoading, error, upload, remove } =
    useDatasets();
  const reports = useReports();

  const [selected, setSelected] = useState<DatasetMeta | null>(null);
  // Chart config carried over when a saved report is opened.
  const [pendingChart, setPendingChart] = useState<ChartConfig | null>(null);
  // Which saved report is currently rendered in the main pane, if any.
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  // Its name, which headlines the report's PDF export.
  const [activeReportName, setActiveReportName] = useState<string | null>(null);
  // Bumped on every selection change so DatasetView / ChartBuilder remount and
  // pick up the new starting tab + chart config from their initial state.
  const [viewVersion, setViewVersion] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  function select(dataset: DatasetMeta) {
    setSelected(dataset);
    setPendingChart(null);
    setActiveReportId(null);
    setActiveReportName(null);
    setViewVersion((v) => v + 1);
  }

  async function openReport(report: Report) {
    setActionError(null);
    // The report only stores a dataset id; find the matching catalog entry.
    let dataset = datasets.find((d) => d.id === report.datasetId) ?? null;
    if (!dataset) {
      try {
        const res = await fetch(`/api/datasets/${report.datasetId}?pageSize=1`, {
          cache: "no-store",
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? "Dataset not found.");
        dataset = body.meta as DatasetMeta;
      } catch (e) {
        setActionError(
          e instanceof Error ? e.message : "Could not open that report."
        );
        return;
      }
    }
    setSelected(dataset);
    setPendingChart(report.chart);
    setActiveReportId(report.id);
    setActiveReportName(report.name);
    setViewVersion((v) => v + 1);
  }

  async function removeDataset(id: string) {
    setActionError(null);
    try {
      await remove(id);
      if (selected?.id === id) {
        setSelected(null);
        setPendingChart(null);
        setActiveReportId(null);
        setActiveReportName(null);
      }
      // Reports on that dataset are deleted server-side too.
      await reports.refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not delete.");
    }
  }

  async function removeReport(id: string) {
    setActionError(null);
    try {
      await reports.remove(id);
      if (activeReportId === id) {
        setActiveReportId(null);
        setActiveReportName(null);
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not delete.");
    }
  }

  async function saveReport(name: string, chart: ChartConfig) {
    if (!selected) return;
    return reports.save(name, selected.id, chart);
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-1 overflow-hidden">
      <aside className="flex w-72 shrink-0 flex-col border-r border-black/10 dark:border-white/10">
        <UploadPanel onUpload={upload} onUploaded={select} />
        <CatalogList
          datasets={datasets}
          isLoading={isLoading}
          error={error}
          query={query}
          onQueryChange={setQuery}
          selectedId={selected?.id ?? null}
          onSelect={select}
          onDelete={removeDataset}
        />
        <ReportsList
          reports={reports.reports}
          error={reports.error}
          activeId={activeReportId}
          onOpen={openReport}
          onDelete={removeReport}
        />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {actionError && (
          <p className="mx-4 mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
            {actionError}
          </p>
        )}

        {selected ? (
          <DatasetView
            key={`${selected.id}:${viewVersion}`}
            dataset={selected}
            pendingChart={pendingChart}
            pendingReportName={activeReportName}
            onSaveReport={saveReport}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Data Explorer
              </p>
              <p className="mt-1 max-w-sm text-xs text-zinc-500 dark:text-zinc-400">
                Upload a CSV or JSON file, then preview it, chart it, and save the
                chart as a report. Files are stored in a Databricks Unity Catalog
                Volume — no cluster required.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
