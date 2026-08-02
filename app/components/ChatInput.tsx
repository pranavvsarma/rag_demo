"use client";

import { useRef, useEffect } from "react";

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming,
  datasetName,
  onUpload,
  onClearDataset,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  isStreaming: boolean;
  datasetName?: string | null;
  onUpload: (file: File) => void;
  onClearDataset: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Auto-grow the textarea up to a few lines.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [value]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    e.target.value = ""; // allow re-uploading the same filename
  }

  return (
    <div className="border-t border-black/10 bg-white/70 p-3 backdrop-blur dark:border-white/10 dark:bg-black/40">
      {datasetName && (
        <div className="mx-auto mb-2 flex max-w-3xl items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-700 dark:text-emerald-300">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
            {datasetName}
            <button
              onClick={onClearDataset}
              aria-label="Remove dataset"
              title="Remove dataset (back to doc chat)"
              className="ml-0.5 rounded-full p-0.5 hover:bg-emerald-500/20"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </span>
        </div>
      )}

      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFile}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={isStreaming}
          aria-label="Upload CSV"
          title="Upload a CSV to chart and query"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/10 text-zinc-500 transition-colors hover:bg-black/[0.04] hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-zinc-100"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>

        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={
            datasetName
              ? `Ask about ${datasetName}, or say "bar chart of …"`
              : "Ask a question about your documents…"
          }
          className="max-h-40 flex-1 resize-none rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500"
        />
        {isStreaming ? (
          <button
            onClick={onStop}
            className="h-10 shrink-0 rounded-xl bg-red-500 px-4 text-sm font-medium text-white transition-colors hover:bg-red-600"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!value.trim()}
            className="h-10 shrink-0 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Send
          </button>
        )}
      </div>
      <p className="mx-auto mt-1.5 max-w-3xl text-center text-[11px] text-zinc-400">
        {datasetName
          ? "Charting CSV · ask for a bar/line/pie chart or a number"
          : "Enter to send · Shift+Enter for newline · 📎 to chart a CSV"}
      </p>
    </div>
  );
}
