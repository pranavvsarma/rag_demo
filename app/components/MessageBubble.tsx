"use client";

import type { Message, RetrievalMeta } from "@/app/hooks/useChat";
import { Sources } from "./Sources";
import { ChartMessage } from "./ChartMessage";

/**
 * Renders a single chat message: either a chart card (when the message
 * carries a generated chart) or a text bubble, styled differently for user
 * vs. assistant. Assistant bubbles also render a typing indicator while
 * streaming and, if present, the retrieved `Sources` panel.
 *
 * @param message - The message to render (role, content, optional chart/sources/retrieval meta).
 * @param streaming - Whether this message is the one currently streaming in;
 *   drives the typing dots (empty content) / blinking cursor (partial content).
 */
export function MessageBubble({
  message,
  streaming,
}: {
  message: Message;
  streaming?: boolean;
}) {
  const isUser = message.role === "user";

  // A generated chart takes a wide card rather than a chat bubble.
  if (message.chart) {
    return (
      <div className="flex justify-start">
        <div className="w-full max-w-[95%]">
          <ChartMessage chart={message.chart} />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
            : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
        }`}
      >
        <p className="whitespace-pre-wrap break-words">
          {message.content}
          {streaming && !message.content && (
            <span className="inline-flex gap-1 align-middle">
              <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
            </span>
          )}
          {streaming && message.content && (
            <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-current align-middle" />
          )}
        </p>

        {!isUser && (message.sources || message.retrieval) && (
          <Sources
            sources={message.sources ?? []}
            retrieval={message.retrieval as RetrievalMeta | undefined}
          />
        )}
      </div>
    </div>
  );
}

/** A single bouncing dot used to build the "assistant is typing" indicator. */
function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-current"
      style={{ animationDelay: delay }}
    />
  );
}
