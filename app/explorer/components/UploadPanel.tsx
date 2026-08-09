"use client";

import { useRef, useState } from "react";
import type { DatasetMeta } from "@/lib/catalog";

interface Props {
  /** Sends the built FormData to the upload API; resolves with the new dataset's metadata. */
  onUpload: (form: FormData) => Promise<DatasetMeta>;
  /** Called after a successful upload so the parent can select the new dataset. */
  onUploaded: (dataset: DatasetMeta) => void;
}

/**
 * Form for uploading a new CSV/JSON dataset with optional name, description,
 * and comma-separated tags. Owns its own busy/error state and resets itself
 * after a successful upload.
 */
export function UploadPanel({ onUpload, onUploaded }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clears the form, including the native file input (which isn't controllable via state).
  function reset() {
    setFile(null);
    setName("");
    setDescription("");
    setTags("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || busy) return;

    setBusy(true);
    setError(null);
    try {
      // Build multipart form data for the upload API; fall back to the
      // file's own name if the user didn't type one.
      const form = new FormData();
      form.append("file", file);
      form.append("name", name.trim() || file.name);
      form.append("description", description);
      form.append("tags", tags);
      const created = await onUpload(form);
      reset();
      onUploaded(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500";

  return (
    <form onSubmit={submit} className="space-y-2 border-b border-black/10 p-4 dark:border-white/10">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Add a dataset
      </h2>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,.json"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          setFile(f);
          // Pre-fill the name field from the file, but don't clobber a name the user already typed.
          if (f && !name.trim()) setName(f.name);
        }}
        className="w-full text-xs text-zinc-600 file:mr-2 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-zinc-700 dark:text-zinc-400 dark:file:bg-zinc-100 dark:file:text-zinc-900 dark:hover:file:bg-zinc-300"
      />

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        className={field}
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className={field}
      />
      <input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="Tags, comma separated (optional)"
        className={field}
      />

      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!file || busy}
        className="w-full rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {busy ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}
