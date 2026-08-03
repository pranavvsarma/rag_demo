"use client";

import { useCallback, useEffect, useState } from "react";
import type { DatasetMeta } from "@/lib/catalog";

/**
 * Catalog state for the Explorer. Hand-rolled fetch + local state, matching the
 * style of app/hooks/useChat.ts (no data-fetching library in this project).
 */
export function useDatasets() {
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (q: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/datasets?q=${encodeURIComponent(q)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
      setDatasets(data.datasets ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the catalog.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounce so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => void refresh(query), 250);
    return () => clearTimeout(t);
  }, [query, refresh]);

  const upload = useCallback(
    async (form: FormData): Promise<DatasetMeta> => {
      const res = await fetch("/api/datasets", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Upload failed (${res.status})`);
      const created = data.dataset as DatasetMeta;
      setDatasets((prev) => [created, ...prev]);
      return created;
    },
    []
  );

  const remove = useCallback(async (id: string) => {
    const res = await fetch(`/api/datasets/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error ?? `Delete failed (${res.status})`);
    }
    setDatasets((prev) => prev.filter((d) => d.id !== id));
  }, []);

  return { datasets, query, setQuery, isLoading, error, upload, remove };
}
