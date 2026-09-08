// Condenses a multi-turn conversation into a standalone search query, so
// follow-ups like "why?" don't get embedded verbatim against the vector
// index. Single-turn conversations skip the LLM call entirely.

import { chatCompletion, type ChatMessage } from "./databricks";

export async function rewriteQuery(
  messages: ChatMessage[]
): Promise<string> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const raw = lastUser?.content?.trim() ?? "";

  const hasHistory = messages.some((m) => m.role === "assistant");
  if (!hasHistory) return raw;

  const context = messages
    .slice(-8) // cap context to keep the call cheap
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  try {
    return await chatCompletion(
      [
        {
          role: "system",
          content:
            "Given this conversation, rewrite the user's last question " +
            "as a single self-contained search query. " +
            "Return ONLY the query — no explanation, no quotes.",
        },
        { role: "user", content: context },
      ],
      { maxTokens: 60, temperature: 0 }
    );
  } catch {
    return raw; // fall back gracefully; never block the request
  }
}
