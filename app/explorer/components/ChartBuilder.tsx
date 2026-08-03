"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartConfig, DatasetMeta } from "@/lib/catalog";
import { CHART_TYPES, type ChartType } from "@/lib/chart-types";
import { downloadChartPng, slugify } from "@/lib/chart-export";
import { AGGS, type Agg, type SeriesPoint } from "@/lib/table";

// Same palette as the chat's ChartMessage, so both surfaces look like one app.
const PALETTE = [
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#db2777",
  "#0891b2",
  "#7c3aed",
  "#dc2626",
  "#65a30d",
  "#0d9488",
  "#c026d3",
];

const AXIS = "#71717a"; // zinc-500 — readable in both themes

interface Props {
  dataset: DatasetMeta;
  /** Config to restore when a saved report is opened. */
  initialChart?: ChartConfig | null;
  onSaveReport: (name: string, chart: ChartConfig) => Promise<unknown>;
}

/**
 * The parent remounts this component (via `key`) whenever the dataset or the
 * opened report changes, so the controls below initialize from `initialChart`
 * once and never need to re-sync in an effect.
 */
export function ChartBuilder({ dataset, initialChart, onSaveReport }: Props) {
  const numericColumns = dataset.columns.filter((c) => c.type === "number");
  // Anything can be a category axis; numbers are usually the measure.
  const categoryColumns = dataset.columns.filter((c) => c.type !== "number");
  const xChoices = categoryColumns.length > 0 ? categoryColumns : dataset.columns;
  const yChoices = numericColumns.length > 0 ? numericColumns : dataset.columns;

  const [type, setType] = useState<ChartType>(initialChart?.type ?? "bar");
  const [x, setX] = useState(initialChart?.x ?? xChoices[0]?.name ?? "");
  const [y, setY] = useState(initialChart?.y ?? yChoices[0]?.name ?? "");
  const [agg, setAgg] = useState<Agg>(
    initialChart?.agg ?? (numericColumns.length > 0 ? "sum" : "count")
  );

  // Cache the series with the query it answers so "is loading" is derived
  // rather than set synchronously inside the effect.
  const [loaded, setLoaded] = useState<{
    key: string;
    series: SeriesPoint[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [reportName, setReportName] = useState("");
  const [saveState, setSaveState] = useState<string | null>(null);

  // Wraps the Recharts surface so the export can grab the live <svg>.
  const chartRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const key = `${dataset.id}|${x}|${y}|${agg}`;
  const isLoading = loaded?.key !== key;
  const series = loaded?.series ?? null;

  useEffect(() => {
    if (!x || (agg !== "count" && !y)) return;

    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      try {
        const params = new URLSearchParams({ x, y, agg });
        const res = await fetch(
          `/api/datasets/${dataset.id}/aggregate?${params}`,
          { cache: "no-store", signal: controller.signal }
        );
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
        setLoaded({
          key: `${dataset.id}|${x}|${y}|${agg}`,
          series: body.series ?? [],
        });
        setError(null);
      } catch (e) {
        if (cancelled || (e as Error)?.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Could not build that chart.");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [dataset.id, x, y, agg]);

  async function save() {
    const name = reportName.trim();
    if (!name) return;
    setSaveState(null);
    try {
      await onSaveReport(name, { type, x, y, agg });
      setReportName("");
      setSaveState(`Saved "${name}".`);
    } catch (e) {
      setSaveState(e instanceof Error ? e.message : "Could not save the report.");
    }
  }

  async function downloadPng() {
    const svg = chartRef.current?.querySelector("svg");
    if (!svg || !series) return;
    setExporting(true);
    try {
      await downloadChartPng(svg, {
        fileName: `${slugify(dataset.name)}-${type}-${slugify(measureLabel)}`,
        // Recharts renders the pie legend as HTML, outside the SVG.
        legend:
          type === "pie"
            ? series.map((p, i) => ({
                label: String(p.x),
                color: PALETTE[i % PALETTE.length],
              }))
            : [],
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not export the chart.");
    } finally {
      setExporting(false);
    }
  }

  const measureLabel = agg === "count" ? "count" : `${agg} of ${y}`;
  const select =
    "rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Chart</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ChartType)}
            className={select}
          >
            {CHART_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Group by (X)
          </span>
          <select value={x} onChange={(e) => setX(e.target.value)} className={select}>
            {xChoices.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Aggregate</span>
          <select
            value={agg}
            onChange={(e) => setAgg(e.target.value as Agg)}
            className={select}
          >
            {AGGS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Measure (Y)
          </span>
          <select
            value={y}
            onChange={(e) => setY(e.target.value)}
            disabled={agg === "count"}
            title={agg === "count" ? "count tallies rows per group" : undefined}
            className={`${select} disabled:opacity-40`}
          >
            {yChoices.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="rounded-2xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-zinc-900">
        <div ref={chartRef} className="h-72 w-full">
          {series && series.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              {type === "bar" ? (
                <BarChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.2)" />
                  <XAxis dataKey="x" tick={{ fill: AXIS, fontSize: 11 }} />
                  <YAxis tick={{ fill: AXIS, fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="y" name={measureLabel} fill={PALETTE[0]} />
                </BarChart>
              ) : type === "line" ? (
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.2)" />
                  <XAxis dataKey="x" tick={{ fill: AXIS, fontSize: 11 }} />
                  <YAxis tick={{ fill: AXIS, fontSize: 11 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="y"
                    name={measureLabel}
                    stroke={PALETTE[0]}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              ) : (
                <PieChart>
                  <Tooltip />
                  <Legend />
                  <Pie data={series} dataKey="y" nameKey="x" outerRadius="75%">
                    {series.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                </PieChart>
              )}
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-zinc-500 dark:text-zinc-400">
              {isLoading ? "Building chart…" : "No data for this combination."}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={reportName}
          onChange={(e) => setReportName(e.target.value)}
          placeholder="Report name"
          className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
        <button
          onClick={save}
          disabled={!reportName.trim() || !series}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Save as report
        </button>

        <button
          onClick={downloadPng}
          disabled={!series || series.length === 0 || exporting}
          title="Download the chart as a PNG image"
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
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M7 10l5 5 5-5" />
            <path d="M12 15V3" />
          </svg>
          {exporting ? "Exporting…" : "Download PNG"}
        </button>

        {saveState && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{saveState}</span>
        )}
      </div>
    </div>
  );
}
