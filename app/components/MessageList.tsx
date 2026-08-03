"use client";

import { useEffect, useRef } from "react";
import type { Message } from "@/app/hooks/useChat";
import { MessageBubble } from "./MessageBubble";

const SUGGESTIONS = [
  "What is the incident response plan?",
  "Summarize the IoT project report.",
  "What are the phases of incident response?",
];

export function MessageList({
  messages,
  isStreaming,
  onPick,
}: {
  messages: Message[];
  isStreaming: boolean;
  onPick: (q: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest content as tokens stream in.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <div>
          <h2 className="text-xl font-semibold text-zinc-800 dark:text-zinc-100">
            Chat with your documents and data
          </h2>
          <p className="mt-1 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
            Ask about your documents — answers are grounded in Databricks Vector
            Search, with sources shown every time. Attach a dataset or a saved
            report from the Data Explorer to ask about your data too.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onPick(s)}
              className="rounded-full border border-black/10 px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-black/[0.03] dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/[0.05]"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const lastId = messages[messages.length - 1]?.id;

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-6">
      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          message={m}
          streaming={isStreaming && m.id === lastId && m.role === "assistant"}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
