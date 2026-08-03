"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChartConfig, Report } from "@/lib/catalog";

async function fetchReports(): Promise<Report[]> {
  const res = await fetch("/api/reports", { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data.reports ?? [];
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : "Could not load reports.";
}

/** Saved-report state for the Explorer. Same hand-rolled fetch style as useDatasets. */
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
