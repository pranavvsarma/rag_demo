"use client";

import { useState } from "react";
import type { Source } from "@/app/hooks/useChat";

/**
 * Collapsible list of the retrieved chunks that grounded an answer.
 * This is the RAG "show your work" UX — it proves the answer came from
 * the documents and lets the user inspect exactly which chunks were used.
 */
export function Sources({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-3 border-t border-black/10 pt-2 dark:border-white/10">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        <span
          className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}
        >
          ▸
        </span>
        {sources.length} source{sources.length > 1 ? "s" : ""}
      </button>

      {open && (
        <ul className="mt-2 space-y-2">
          {sources.map((s, i) => (
            <li
              key={s.id || i}
              className="rounded-md bg-black/[0.03] p-2 text-xs dark:bg-white/[0.04]"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-medium text-zinc-700 dark:text-zinc-200">
                  [{i + 1}] {s.source}
                </span>
                <span className="shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700 dark:text-emerald-300">
                  {(s.score * 100).toFixed(0)}% match
                </span>
              </div>
              <p className="line-clamp-3 text-zinc-500 dark:text-zinc-400">
                {s.text}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
