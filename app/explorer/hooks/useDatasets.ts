"use client";

import { useCallback, useEffect, useState } from "react";
import type { DatasetMeta } from "@/lib/catalog";

/**
 * Catalog state for the Explorer. Hand-rolled fetch + local state, matching the
 * style of app/hooks/useChat.ts (no data-fetching library in this project).
 *
 * Returns:
 *  - datasets: current catalog listing (filtered by `query` server-side)
 *  - query / setQuery: search box state; changing it re-fetches (debounced)
 *  - isLoading / error: status of the in-flight/last `refresh`
 *  - upload(form): POST a new dataset, prepend it to `datasets` on success
 *  - remove(id): DELETE a dataset, drop it from `datasets` on success
 */
export function useDatasets() {
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetches the catalog filtered by `q` and replaces local state with the result.
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

  // Uploads a new file (multipart form) and optimistically prepends the
  // server's created-dataset record to the local list.
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

  // Deletes a dataset server-side, then removes it from local state.
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
