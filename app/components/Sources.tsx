"use client";

import { useState } from "react";
import type { Source, RetrievalMeta } from "@/app/hooks/useChat";

/**
 * Collapsible panel attached to an assistant message showing the RAG
 * retrieval evidence: which document chunks were used (with similarity and
 * rerank scores), the rewritten search query (if different from what the
 * user typed), and, when the model abstained from answering, how many
 * candidates were retrieved but none cleared the relevance floor.
 *
 * @param sources - Retrieved chunks that were actually used to ground the answer.
 * @param retrieval - Metadata about the retrieval step itself (query
 *   rewriting, candidate count, whether the model abstained). May be present
 *   even when `sources` is empty, e.g. on an abstain.
 */
export function Sources({
  sources,
  retrieval,
}: {
  sources: Source[];
  retrieval?: RetrievalMeta;
}) {
  const [open, setOpen] = useState(false);

  const hasChunks = sources.length > 0;
  const abstained = retrieval?.abstained ?? false;

  // Nothing at all to show.
  if (!hasChunks && !retrieval) return null;

  // Label reflects whether the model abstained (show candidates considered)
  // or answered normally (show sources actually cited).
  const label = abstained
    ? `${retrieval!.candidateCount} candidate${retrieval!.candidateCount !== 1 ? "s" : ""} retrieved`
    : `${sources.length} source${sources.length !== 1 ? "s" : ""}`;

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
        {label}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {/* Rewritten query line */}
          {retrieval?.rewritten && retrieval.searchQuery !== retrieval.originalQuery && (
            <p className="text-[11px] italic text-zinc-400 dark:text-zinc-500">
              searched for: <span className="not-italic text-zinc-500 dark:text-zinc-400">{retrieval.searchQuery}</span>
            </p>
          )}

          {/* Abstain notice */}
          {abstained && (
            <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-300">
              {retrieval!.candidateCount} candidate{retrieval!.candidateCount !== 1 ? "s" : ""} retrieved — none scored above the relevance floor.
            </p>
          )}

          {/* Chunk list */}
          {hasChunks && (
            <ul className="space-y-2">
              {sources.map((s, i) => (
                <li
                  key={s.id || i}
                  className="rounded-md bg-black/[0.03] p-2 text-xs dark:bg-white/[0.04]"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-medium text-zinc-700 dark:text-zinc-200">
                      [{i + 1}] {s.source}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      {s.rerankScore !== undefined && (
                        <span className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-[10px] text-blue-700 dark:text-blue-300">
                          rank {s.rerankScore}/10
                        </span>
                      )}
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700 dark:text-emerald-300">
                        {(s.score * 100).toFixed(0)}% match
                      </span>
                    </div>
                  </div>
                  <p className="line-clamp-3 text-zinc-500 dark:text-zinc-400">
                    {s.text}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
