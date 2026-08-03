"use client";

import { useEffect, useRef } from "react";
import { useChat } from "@/app/hooks/useChat";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";

export function ChatWindow({
  datasetId,
  reportId,
}: {
  /** From `/?dataset=<id>` — a catalog dataset to attach on arrival. */
  datasetId?: string;
  /** From `/?report=<id>` — a saved report to open on arrival. Wins over `datasetId`. */
  reportId?: string;
}) {
  const {
    messages,
    input,
    setInput,
    send,
    stop,
    reset,
    isStreaming,
    error,
    dataset,
    datasetNote,
    isLoadingDataset,
    attachDataset,
    clearDataset,
    openCatalogDataset,
    openReport,
  } = useChat();

  // Handle a Data Explorer deep link, then strip the param. The strip uses the
  // native history API, which the App Router picks up without re-running the
  // server render — a router.replace() here would round-trip for nothing.
  const handled = useRef<string | null>(null);
  useEffect(() => {
    const key = reportId ? `r:${reportId}` : datasetId ? `d:${datasetId}` : null;
    if (!key) {
      handled.current = null;
      return;
    }
    if (handled.current === key) return;
    handled.current = key;

    const opened = reportId
      ? openReport(reportId)
      : openCatalogDataset(datasetId!);
    void opened.finally(() => {
      window.history.replaceState(null, "", "/");
    });
  }, [datasetId, reportId, openCatalogDataset, openReport]);

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-black/10 px-4 py-3 dark:border-white/10">
        {messages.length > 0 && (
          <button
            onClick={reset}
            aria-label="Back to start"
            title="Back to start (new chat)"
            className="shrink-0 rounded-full p-2 text-zinc-500 transition-colors hover:bg-black/5 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
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
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <div>
          <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Databricks RAG · Chat with your docs and data. Create charts with datasets in Data Explorer
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Next.js · React · Databricks Vector Search + Llama 3.3 70B
          </p>
        </div>
      </header>

      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        onPick={(q) => send(q)}
      />

      {error && (
        <div className="mx-4 mb-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </div>
      )}

      {isLoadingDataset && (
        <div className="mx-4 mb-2 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 text-xs text-zinc-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
          Loading from the Data Explorer…
        </div>
      )}

      {datasetNote && (
        <div className="mx-4 mb-2 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 text-xs text-zinc-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
          {datasetNote}
        </div>
      )}

      <ChatInput
        value={input}
        onChange={setInput}
        onSend={() => send()}
        onStop={stop}
        isStreaming={isStreaming}
        datasetName={dataset?.name ?? null}
        onUpload={attachDataset}
        onClearDataset={clearDataset}
      />
    </div>
  );
}
