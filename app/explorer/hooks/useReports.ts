"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChartConfig, Report } from "@/lib/catalog";

// GET the full saved-reports list from the server.
async function fetchReports(): Promise<Report[]> {
  const res = await fetch("/api/reports", { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data.reports ?? [];
}

// Normalize a caught value into a user-facing error message.
function message(e: unknown): string {
  return e instanceof Error ? e.message : "Could not load reports.";
}

/**
 * Saved-report state for the Explorer. Same hand-rolled fetch style as useDatasets.
 *
 * Returns:
 *  - reports: current list of saved reports (loaded on mount)
 *  - error: message from the last failed load/save/delete, else null
 *  - save(name, datasetId, chart): POST a new report, prepend it on success
 *  - remove(id): DELETE a report, drop it from `reports` on success
 *  - refresh(): re-fetch the full list (e.g. after a server-side cascade)
 */
export function useReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Initial load. State is only touched after the await, so the effect never
  // sets state synchronously (which would trigger cascading renders).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await fetchReports();
        if (cancelled) return;
        setReports(loaded);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(message(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Imperative re-fetch, used after a delete cascades server-side. */
  const refresh = useCallback(async () => {
    try {
      setReports(await fetchReports());
      setError(null);
    } catch (e) {
      setError(message(e));
    }
  }, []);

  // Persists a new report and prepends the server's created record locally.
  const save = useCallback(
    async (name: string, datasetId: string, chart: ChartConfig) => {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, datasetId, chart }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Save failed (${res.status})`);
      setReports((prev) => [data.report as Report, ...prev]);
      return data.report as Report;
    },
    []
  );

  // Deletes a report server-side, then removes it from local state.
  const remove = useCallback(async (id: string) => {
    const res = await fetch(`/api/reports/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error ?? `Delete failed (${res.status})`);
    }
    setReports((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return { reports, error, save, remove, refresh };
}
