// Hand-rolled ReAct-style agent loop: repeatedly offers the model the
// search_documents tool until it stops requesting searches (or a hard
// iteration cap is hit), then hands the conversation back for a final
// streaming answer. See agent-plan.md for the full design rationale.

import { chatCompletionWithTools, type AgentMessage, type ChatMessage, type Source } from "./databricks";
import { TOOL_DEFINITIONS, executeTool, formatToolResult } from "./tools";

const MAX_ITERATIONS = 5;

const SYSTEM_PROMPT = `You are a helpful assistant that answers questions about the user's documents.
Always search before answering. If results don't fully address the question, search again
with a different or more specific query. Answer using ONLY information from search results.
Cite source filenames in square brackets, e.g. [warranty.md].
If search results don't contain the answer, say so — do not invent information.`;

export interface AgentResult {
  sources: Source[];
  conversation: AgentMessage[];
  iterations: number;
}

/**
 * Run the search → evaluate loop. Always returns with `conversation` ending
 * at the last tool results (never a final assistant message) — the caller is
 * responsible for the final `chatCompletionStream(conversation)` call that
 * generates the streamed answer, whether the model stopped naturally or the
 * iteration cap was hit.
 */
export async function runAgent(
  messages: ChatMessage[],
  signal?: AbortSignal,
  searchHint?: string
): Promise<AgentResult> {
  const systemContent = searchHint
    ? `${SYSTEM_PROMPT}\n\nBegin by searching for: "${searchHint}"`
    : SYSTEM_PROMPT;

  const conversation: AgentMessage[] = [{ role: "system", content: systemContent }, ...messages];
  const allSources: Source[] = [];
  const seenIds = new Set<string>();

  let iterations = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    iterations++;
    const response = await chatCompletionWithTools(conversation, TOOL_DEFINITIONS, signal);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      break; // model is ready to answer — don't append, let streaming handle it
    }

    conversation.push({
      role: "assistant",
      content: response.content,
      tool_calls: response.tool_calls,
    });

    for (const call of response.tool_calls) {
      console.log(`[agent] iter=${iterations} tool=${call.function.name} args=${call.function.arguments}`);

      const result = await executeTool(call, signal);

      for (const source of result.results) {
        if (!seenIds.has(source.id)) {
          seenIds.add(source.id);
          allSources.push(source);
        }
      }

      conversation.push({
        role: "tool",
        tool_call_id: call.id,
        content: formatToolResult(result.results, result.error),
      });

      console.log(`[agent] returned ${result.results.length} results`);
    }
  }

  return { sources: allSources, conversation, iterations };
}
