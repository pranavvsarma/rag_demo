import { chatCompletionStream, type ChatMessage } from "@/lib/databricks";
import { runRetrievalPipeline, type RetrievalMeta } from "@/lib/rag";
import type { Source } from "@/lib/databricks";

/**
 * POST /api/chat — the RAG chat endpoint used by the chat UI.
 * Given the running conversation, it retrieves (and reranks) relevant
 * document chunks from Databricks, then streams back a grounded answer
 * from the LLM. If nothing sufficiently relevant is found, it abstains
 * instead of calling the model. Response body is a streamed, newline-framed
 * payload: first line is JSON (sources + retrieval metadata), followed by
 * the plain-text answer tokens.
 */

// Talks to Databricks (network + secrets); must run on Node and never cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `You are a helpful assistant that answers questions about the user's documents.
Rules:
- Answer using ONLY the information in the provided context.
- If the context does not contain the answer, say you don't know based on the available documents. Do not make things up.
- Be concise, and cite the source filename(s) you used in square brackets, e.g. [warranty.md].`;

/** Format retrieved chunks into the numbered, citable context block for the prompt. */
function buildContextBlock(sources: Source[]): string {
  if (sources.length === 0) return "No relevant documents were found.";
  return sources
    .map((s, i) => `[${i + 1}] (source: ${s.source})\n${s.text}`)
    .join("\n\n");
}

/** Emit the framing line then a canned abstain sentence and close the stream. */
function abstainStream(
  meta: RetrievalMeta,
  sources: Source[],
  encoder: TextEncoder
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const frame = JSON.stringify({ sources: serializeSources(sources), retrieval: meta });
      controller.enqueue(encoder.encode(frame + "\n"));
      controller.enqueue(
        encoder.encode(
          "I don't have anything in the documents about that."
        )
      );
      controller.close();
    },
  });
}

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

    // Four-stage retrieval pipeline: condense → retrieve → rerank → floor.
    const t1 = Date.now();
    const { sources, meta } = await runRetrievalPipeline(messages);
    const tPipeline = Date.now() - t1;

    // Log per-request diagnostics: timings + full rerank score distribution.
    const scores = sources.map((s) => s.rerankScore ?? "–").join(", ");
    console.log(
      `[chat] pipeline=${tPipeline}ms | rewritten=${meta.rewritten} | reranked=${meta.reranked} | candidates=${meta.candidateCount} | kept=${sources.length} | dropped=${meta.droppedByFloor} | abstained=${meta.abstained} | scores=[${scores}] | total=${Date.now() - t0}ms`
    );

    const encoder = new TextEncoder();

    // Short-circuit when the relevance floor abstained — no generation call.
    if (meta.abstained) {
      return new Response(abstainStream(meta, sources, encoder), {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    // Build the grounded prompt and stream the answer.
    const chatMessages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "system",
        content: `Context from the user's documents:\n\n${buildContextBlock(sources)}`,
      },
      ...messages,
    ];

    const upstream = await chatCompletionStream(chatMessages);
    const decoder = new TextDecoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        // First line: sources + retrieval metadata.
        const frame = JSON.stringify({
          sources: serializeSources(sources),
          retrieval: meta,
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
