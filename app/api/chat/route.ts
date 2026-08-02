import {
  retrieve,
  chatCompletionStream,
  type Source,
  type ChatMessage,
} from "@/lib/databricks";

// This route talks to Databricks (network + secrets) on every request, so it
// must run on the Node runtime and never be cached/prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `You are a helpful assistant that answers questions about the user's documents.
Rules:
- Answer using ONLY the information in the provided context.
- If the context does not contain the answer, say you don't know based on the available documents. Do not make things up.
- Be concise, and cite the source filename(s) you used in square brackets, e.g. [warranty.md].`;

function buildContextBlock(sources: Source[]): string {
  if (sources.length === 0) return "No relevant documents were found.";
  return sources
    .map((s, i) => `[${i + 1}] (source: ${s.source})\n${s.text}`)
    .join("\n\n");
}

export async function POST(request: Request) {
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

    // 1. Retrieve grounding chunks from Databricks Vector Search.
    const sources = await retrieve(query, 5);

    // 2. Build a grounded prompt: system rules + retrieved context + history.
    const chatMessages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "system",
        content: `Context from the user's documents:\n\n${buildContextBlock(sources)}`,
      },
      ...messages,
    ];

    // 3. Stream generation from the Databricks Foundation Model endpoint.
    const upstream = await chatCompletionStream(chatMessages);

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        // Protocol: the FIRST line is a JSON object with the sources, then the
        // rest of the stream is the raw answer text (which may contain newlines).
        const meta = sources.map((s) => ({
          id: s.id,
          source: s.source,
          score: s.score,
          text: s.text,
        }));
        controller.enqueue(encoder.encode(JSON.stringify({ sources: meta }) + "\n"));

        const reader = upstream.body!.getReader();
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // Databricks returns SSE: lines like `data: {json}` separated by \n.
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
