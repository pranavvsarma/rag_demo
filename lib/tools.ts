// Tool registry for the agent loop. Currently a single tool — document
// search — that wraps retrieve + rerank + relevance floor so the model gets
// only quality-filtered results back, and can decide whether to search again.

import { retrieve } from "./databricks";
import { rerankSources, applyRelevanceFloor } from "./rag";
import type { Source, ToolCall } from "./databricks";

const CHUNK_CHAR_LIMIT = 600;
const DEFAULT_NUM_RESULTS = 5;
const MAX_NUM_RESULTS = 8;

type ToolResult = {
  results: Source[];
  error?: string;
};

type Tool = {
  definition: {
    type: "function";
    function: { name: string; description: string; parameters: Record<string, unknown> };
  };
  displayName: string; // human-facing, never serialized into the prompt
  run: (args: Record<string, unknown>, signal?: AbortSignal) => Promise<ToolResult>;
};

const searchDocumentsTool: Tool = {
  displayName: "Document Search",
  definition: {
    type: "function",
    function: {
      name: "search_documents",
      description:
        "Search the document corpus for content relevant to the user's question. " +
        "Call this whenever you need information to answer. " +
        "If results are weak or don't fully cover the question, call again with a more specific query. " +
        "Only set source_filter to a filename you observed in a previous search result — do not guess filenames.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query.",
          },
          source_filter: {
            type: "string",
            description:
              "Restrict results to this document filename. Only use a name observed in a previous search result.",
          },
          num_results: {
            type: "number",
            description: `Number of results to return (1–${MAX_NUM_RESULTS}, default ${DEFAULT_NUM_RESULTS}).`,
          },
        },
        required: ["query"],
      },
    },
  },
  async run(args, signal) {
    const {
      query,
      source_filter: sourceFilter,
      num_results: numResults = DEFAULT_NUM_RESULTS,
    } = args as { query: string; source_filter?: string; num_results?: number };

    const topK = Math.min(Math.max(1, Math.round(numResults)), MAX_NUM_RESULTS);

    try {
      // Oversample for the reranker
      const candidates = await retrieve(query, topK * 2, signal, sourceFilter);

      // Quality enforced inside the tool — rerank + floor
      const { sources: ranked, reranked } = await rerankSources(query, candidates, topK, signal);
      const { kept } = applyRelevanceFloor(ranked, reranked);

      // Truncate for context budget before returning to the conversation
      const results = kept.map((s) => ({
        ...s,
        text: s.text.length > CHUNK_CHAR_LIMIT ? s.text.slice(0, CHUNK_CHAR_LIMIT) + "…" : s.text,
      }));

      return { results };
    } catch (e) {
      return { results: [], error: e instanceof Error ? e.message : "Search failed" };
    }
  },
};

export const TOOLS: Tool[] = [searchDocumentsTool];
export const TOOL_DEFINITIONS = TOOLS.map((t) => t.definition);

/** Render tool results as the plain-text `tool` message content the model reads. */
export function formatToolResult(results: Source[], error?: string): string {
  if (error) return `Error: ${error}`;
  if (results.length === 0) return "No relevant results found.";
  return results
    .map(
      (s, i) =>
        `[${i + 1}] ${s.source} (relevance: ${s.rerankScore ?? Math.round(s.score * 10)}/10)\n${s.text}`
    )
    .join("\n\n");
}

/** Look up and run the tool named in a model-issued tool call. */
export async function executeTool(call: ToolCall, signal?: AbortSignal): Promise<ToolResult> {
  const tool = TOOLS.find((t) => t.definition.function.name === call.function.name);
  if (!tool) return { results: [], error: `Unknown tool: ${call.function.name}` };

  let args: Record<string, unknown>;
  try {
    args = JSON.parse(call.function.arguments);
  } catch {
    return { results: [], error: "Invalid tool arguments" };
  }

  return tool.run(args, signal);
}
