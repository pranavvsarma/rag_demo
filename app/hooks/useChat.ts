"use client";

import { useCallback, useRef, useState } from "react";
import {
  parseCsvFile,
  datasetSummary,
  aggregateSeries,
  computeOp,
  pretty,
  type Dataset,
  type Envelope,
  type ChartKind,
} from "@/lib/csv";

export interface Source {
  id: string;
  source: string;
  score: number;
  text: string;
}

export interface ChartPayload {
  kind: ChartKind;
  labels: string[];
  values: number[];
  title?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  /** Present when this assistant message is a generated chart. */
  chart?: ChartPayload;
}

/**
 * Hand-rolled chat hook. Two modes share the same conversation UI:
 *  - No dataset  → doc-RAG streaming path (/api/chat): the first body line is a
 *    JSON blob of retrieval sources, the rest is the answer streamed token by
 *    token.
 *  - Dataset set → "chat with your CSV" (/api/data): the model returns a
 *    structured envelope and the browser computes the chart/number locally, so
 *    all figures are exact.
 */
export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [datasetNote, setDatasetNote] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const patchAssistant = useCallback(
    (id: string, patch: (m: Message) => Message) => {
      setMessages((prev) => prev.map((m) => (m.id === id ? patch(m) : m)));
    },
    []
  );

  // Parse a CSV in the browser, then persist it to the Databricks Volume.
  const attachDataset = useCallback(async (file: File) => {
    setError(null);
    setDatasetNote(null);
    try {
      const ds = await parseCsvFile(file);
      setDataset(ds);
      // Best-effort persistence — charting still works if this fails.
      // Uploading here also registers the file in the Data Explorer catalog,
      // so a CSV attached in chat shows up under /explorer.
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("name", file.name);
        form.append("description", "Uploaded from chat");
        form.append("tags", "chat");
        const res = await fetch("/api/datasets", { method: "POST", body: form });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setDatasetNote(
            `Loaded "${ds.name}" — not saved to Databricks (${
              j?.error ?? res.status
            })`
          );
        } else {
          setDatasetNote(
            `Saved "${ds.name}" to Databricks — also available in the Data Explorer.`
          );
        }
      } catch {
        setDatasetNote(`Loaded "${ds.name}" — not saved to Databricks.`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not read that CSV.";
      setError(msg);
    }
  }, []);

  const clearDataset = useCallback(() => {
    setDataset(null);
    setDatasetNote(null);
  }, []);

  // ----- Doc-RAG path (unchanged behavior) -----
  const sendToDocs = useCallback(
    async (history: Message[], assistantId: string) => {
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        let msg = `Request failed (${res.status})`;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sourcesParsed = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // First line = sources JSON.
        if (!sourcesParsed) {
          const nl = buffer.indexOf("\n");
          if (nl === -1) continue;
          const firstLine = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          sourcesParsed = true;
          try {
            const meta = JSON.parse(firstLine);
            const sources: Source[] = meta?.sources ?? [];
            patchAssistant(assistantId, (m) => ({ ...m, sources }));
          } catch {
            /* ignore malformed sources line */
          }
        }

        // Everything after = answer text.
        if (sourcesParsed && buffer) {
          const chunk = buffer;
          buffer = "";
          patchAssistant(assistantId, (m) => ({
            ...m,
            content: m.content + chunk,
          }));
        }
      }
    },
    [patchAssistant]
  );

  // ----- CSV path: plan on the server, compute in the browser -----
  const sendToData = useCallback(
    async (ds: Dataset, question: string, assistantId: string) => {
      const res = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, summary: datasetSummary(ds) }),
      });

      const data = await res.json();
      if (!res.ok || data?.error) {
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }

      const env = data as Envelope;

      if (env.type === "chart") {
        const cols = new Set(ds.columns.map((c) => c.name));
        if (!cols.has(env.x) || (env.agg !== "count" && !cols.has(env.y))) {
          patchAssistant(assistantId, (m) => ({
            ...m,
            content:
              "I couldn't match that to the dataset's columns. Try naming the columns explicitly.",
          }));
          return;
        }
        const series = aggregateSeries(ds, env.x, env.y, env.agg);
        patchAssistant(assistantId, (m) => ({
          ...m,
          content: "",
          chart: {
            kind: env.kind,
            labels: series.labels,
            values: series.values,
            title: env.title,
          },
        }));
        return;
      }

      if (env.type === "compute") {
        const result = computeOp(ds, env.op, env.column, env.groupBy);
        let content: string;
        if (result.kind === "scalar") {
          const val = pretty(result.value);
          content = env.phrasing
            ? env.phrasing.replace(/\{value\}/g, val)
            : `${env.op} of ${env.column}: ${val}`;
        } else {
          const lines = result.series.labels.map(
            (l, i) => `• ${l}: ${pretty(result.series.values[i])}`
          );
          const header = env.phrasing
            ? env.phrasing.replace(/\{value\}/g, "").trim()
            : `${env.op} of ${env.column} by ${env.groupBy}`;
          content = `${header}\n${lines.join("\n")}`;
        }
        patchAssistant(assistantId, (m) => ({ ...m, content }));
        return;
      }

      // Text / fallback.
      patchAssistant(assistantId, (m) => ({
        ...m,
        content: env.type === "text" ? env.answer : "I couldn't answer that.",
      }));
    },
    [patchAssistant]
  );

  const send = useCallback(
    async (override?: string) => {
      const content = (override ?? input).trim();
      if (!content || isStreaming) return;

      setError(null);
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
      };
      const assistantId = crypto.randomUUID();
      const history = [...messages, userMsg];

      // Optimistically render the user message + an empty assistant placeholder.
      setMessages([
        ...history,
        { id: assistantId, role: "assistant", content: "" },
      ]);
      setInput("");
      setIsStreaming(true);

      try {
        if (dataset) {
          await sendToData(dataset, content, assistantId);
        } else {
          await sendToDocs(history, assistantId);
        }
      } catch (e) {
        const err = e as { name?: string; message?: string };
        if (err?.name !== "AbortError") {
          setError(err?.message ?? "Something went wrong");
          patchAssistant(assistantId, (m) => ({
            ...m,
            content: m.content || "Sorry — I couldn't answer that.",
          }));
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [
      input,
      isStreaming,
      messages,
      dataset,
      sendToDocs,
      sendToData,
      patchAssistant,
    ]
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  // Clear the conversation and return to the empty landing screen.
  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setInput("");
    setError(null);
    setIsStreaming(false);
    setDataset(null);
    setDatasetNote(null);
  }, []);

  return {
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
    attachDataset,
    clearDataset,
  };
}
