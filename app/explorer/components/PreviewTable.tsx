"use client";

import { useEffect, useState } from "react";
import type { Cell, TableColumn } from "@/lib/table";
import { fmtCell } from "@/lib/table";

const PAGE_SIZE = 50;

interface PreviewResponse {
  columns: TableColumn[];
  rows: Record<string, Cell>[];
  total: number;
}

export function PreviewTable({ datasetId }: { datasetId: string }) {
  const [page, setPage] = useState(1);
  // Cache the response together with the request it answers, so "is loading"
  // is derived rather than set from inside the effect.
  const [loaded, setLoaded] = useState<{
    key: string;
    data: PreviewResponse;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const key = `${datasetId}:${page}`;
  const isLoading = loaded?.key !== key;
  const data = loaded?.data ?? null;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(
          `/api/datasets/${datasetId}?page=${page}&pageSize=${PAGE_SIZE}`,
          { cache: "no-store", signal: controller.signal }
        );
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
        setLoaded({ key: `${datasetId}:${page}`, data: body as PreviewResponse });
        setError(null);
      } catch (e) {
        if (cancelled || (e as Error)?.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Could not load the preview.");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [datasetId, page]);

  if (error) {
    return (
      <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
        {error}
      </p>
    );
  }

  if (!data) {
    return <p className="text-xs text-zinc-500 dark:text-zinc-400">Loading preview…</p>;
  }

  const lastPage = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const first = data.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, data.total);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
        <table className="min-w-full border-collapse text-left text-xs">
          <thead className="bg-black/[0.03] dark:bg-white/[0.04]">
            <tr>
              {data.columns.map((c) => (
                <th
                  key={c.name}
                  className="whitespace-nowrap px-3 py-2 font-medium text-zinc-700 dark:text-zinc-200"
                >
                  {c.name}
                  <span className="ml-1.5 text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                    {c.type}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => (
              <tr
                key={i}
                className="border-t border-black/[0.06] dark:border-white/[0.08]"
              >
                {data.columns.map((c) => (
                  <td
                    key={c.name}
                    className="max-w-xs truncate whitespace-nowrap px-3 py-1.5 text-zinc-600 dark:text-zinc-300"
                  >
                    {fmtCell(row[c.name] ?? null)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
        <span>
          {first.toLocaleString()}–{last.toLocaleString()} of{" "}
          {data.total.toLocaleString()} rows
          {isLoading && " · loading…"}
        </span>
        <span className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-black/10 px-2 py-1 transition-colors hover:bg-black/[0.04] disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/[0.06]"
          >
            Previous
          </button>
          <span>
            Page {page} of {lastPage}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
            disabled={page >= lastPage}
            className="rounded-lg border border-black/10 px-2 py-1 transition-colors hover:bg-black/[0.04] disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/[0.06]"
          >
            Next
          </button>
        </span>
      </div>
    </div>
  );
}
