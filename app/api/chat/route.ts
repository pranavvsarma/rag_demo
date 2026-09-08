import { chatCompletionStream, type ChatMessage } from "@/lib/databricks";
import { runAgent } from "@/lib/agent";
import { rewriteQuery } from "@/lib/query-rewrite";
import type { Source } from "@/lib/databricks";

/**
 * POST /api/chat — the RAG chat endpoint used by the chat UI.
 * Given the running conversation, it runs an agent loop that searches the
 * document corpus (with reranking + a relevance floor applied inside the
 * tool) until it has enough to answer, then streams back a grounded answer
 * from the LLM. Response body is a streamed, newline-framed payload: first
 * line is JSON (sources + retrieval metadata), followed by the plain-text
 * answer tokens.
 */

// Talks to Databricks (network + secrets); must run on Node and never cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Trim each Source down to the fields the client needs to render citations. */
function serializeSources(sources: Source[]) {
  return sources.map((s) => ({
    id: s.id,
    source: s.source,
    score: s.score,
    rerankScore: s.rerankScore,
    text: s.text,
  }));
}

/**
 * Handle a chat turn. Expects JSON body `{ messages: ChatMessage[] }` (the
 * full conversation so far). Returns a streamed text/plain response, or a
 * JSON error object with 400/500 status on failure.
 */
export async function POST(request: Request) {
  const t0 = Date.now();
  try {
    const body = await request.json();
    const messages: ChatMessage[] = Array.isArray(body?.messages)
      ? body.messages
      : [];

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const query = lastUser?.content?.trim() ?? "";

    if (!query) {
      return Response.json({ error: "No user message provided." }, { status: 400 });
    }

    // Follow-ups ("why?") are semantically meaningless to the vector index on
    // their own — condense conversation + question into a standalone query
    // before retrieval. Single-turn conversations skip the LLM call.
    const hasHistory = messages.some((m) => m.role === "assistant");
    const searchQuery = hasHistory ? await rewriteQuery(messages) : query;

    if (searchQuery !== query) {
      console.log(`[chat] query_rewrite: "${query}" -> "${searchQuery}"`);
    }

    // Agent loop: search_documents (rerank + floor applied inside the tool)
    // until the model has enough to answer, or the iteration cap is hit.
    const t1 = Date.now();
    const { sources, conversation, iterations } = await runAgent(messages, undefined, searchQuery);
    const tAgent = Date.now() - t1;

    // Log per-request diagnostics: timings + full rerank score distribution.
    const scores = sources.map((s) => s.rerankScore ?? "–").join(", ");
    console.log(
      `[chat] agent_iters=${iterations} | agent=${tAgent}ms | sources=${sources.length} | scores=[${scores}] | total=${Date.now() - t0}ms`
    );

    const encoder = new TextEncoder();

    // Final streaming turn — no tools passed, so the model generates plain
    // text from the full agent conversation (system + turns + tool results).
    const upstream = await chatCompletionStream(conversation);
    const decoder = new TextDecoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        // First line: sources + retrieval metadata.
        const frame = JSON.stringify({
          sources: serializeSources(sources),
          retrieval: {
            originalQuery: query,
            searchQuery,
            rewritten: searchQuery !== query,
            reranked: true,
            candidateCount: sources.length,
            droppedByFloor: 0,
            abstained: false,
            agentIterations: iterations,
          },
        });
        controller.enqueue(encoder.encode(frame + "\n"));

        const reader = upstream.body!.getReader();
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const payload = trimmed.slice(5).trim();
              if (payload === "" || payload === "[DONE]") continue;
              try {
                const json = JSON.parse(payload);
                const token = json?.choices?.[0]?.delta?.content ?? "";
                if (token) controller.enqueue(encoder.encode(token));
              } catch {
                // Ignore keep-alive / partial lines.
              }
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "stream error";
          controller.enqueue(encoder.encode(`\n\n[stream error: ${msg}]`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
