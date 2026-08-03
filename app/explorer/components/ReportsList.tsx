"use client";

import type { Report } from "@/lib/catalog";

interface Props {
  reports: Report[];
  error: string | null;
  activeId: string | null;
  onOpen: (report: Report) => void;
  onDelete: (id: string) => void;
}

export function ReportsList({ reports, error, activeId, onOpen, onDelete }: Props) {
  return (
    <div className="border-t border-black/10 p-4 dark:border-white/10">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Saved reports
      </h2>

      {error && (
        <p className="mt-2 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      )}

      {reports.length === 0 ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          None yet — build a chart and save it.
        </p>
      ) : (
        <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto">
          {reports.map((r) => {
            const active = r.id === activeId;
            return (
            <li
              key={r.id}
              className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                active
                  ? "bg-black/[0.06] dark:bg-white/10"
                  : "hover:bg-black/[0.03] dark:hover:bg-white/[0.06]"
              }`}
            >
              <button
                onClick={() => onOpen(r)}
                aria-current={active ? "true" : undefined}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">
                  {r.name}
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {r.chart.type} · {r.chart.agg} of {r.chart.y} by {r.chart.x}
                </p>
              </button>
              <button
                onClick={() => onDelete(r.id)}
                aria-label={`Delete report ${r.name}`}
                title="Delete report"
                className="shrink-0 rounded-md p-1 text-zinc-400 opacity-0 transition-opacity hover:bg-black/5 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-white/10 dark:hover:text-red-400"
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
                  <path d="M3 6h18" />
                  <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                  <path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
                </svg>
              </button>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
