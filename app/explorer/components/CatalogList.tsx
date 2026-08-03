"use client";

import type { DatasetMeta } from "@/lib/catalog";

interface Props {
  datasets: DatasetMeta[];
  isLoading: boolean;
  error: string | null;
  query: string;
  onQueryChange: (q: string) => void;
  selectedId: string | null;
  onSelect: (dataset: DatasetMeta) => void;
  onDelete: (id: string) => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

export function CatalogList({
  datasets,
  isLoading,
  error,
  query,
  onQueryChange,
  selectedId,
  onSelect,
  onDelete,
}: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-4 pb-2">
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search datasets…"
          className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
      </div>

      {error && (
        <p className="mx-4 mb-2 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      )}

      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {isLoading && datasets.length === 0 && (
          <li className="px-2 py-3 text-xs text-zinc-500 dark:text-zinc-400">Loading…</li>
        )}

        {!isLoading && datasets.length === 0 && (
          <li className="px-2 py-3 text-xs text-zinc-500 dark:text-zinc-400">
            {query ? "No datasets match that search." : "No datasets yet — upload one above."}
          </li>
        )}

        {datasets.map((d) => {
          const selected = d.id === selectedId;
          return (
            <li key={d.id}>
              <div
                className={`group flex items-start gap-2 rounded-lg px-2 py-2 transition-colors ${
                  selected
                    ? "bg-black/[0.06] dark:bg-white/10"
                    : "hover:bg-black/[0.03] dark:hover:bg-white/[0.06]"
                }`}
              >
                <button
                  onClick={() => onSelect(d)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">
                    {d.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    {d.format.toUpperCase()} · {d.rowCount.toLocaleString()} rows ·{" "}
                    {formatDate(d.uploadedAt)}
                  </p>
                  {d.tags.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {d.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-white/10 dark:text-zinc-300"
                        >
                          {t}
                        </span>
                      ))}
                    </p>
                  )}
                </button>

                <button
                  onClick={() => {
                    if (confirm(`Delete "${d.name}"? This also removes its saved reports.`)) {
                      onDelete(d.id);
                    }
                  }}
                  aria-label={`Delete ${d.name}`}
                  title="Delete dataset"
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
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
