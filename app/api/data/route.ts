import { chatCompletion, type ChatMessage } from "@/lib/databricks";

/**
 * POST /api/data — the Data Explorer's natural-language query endpoint.
 * Given a question and a dataset summary, the LLM decides *what* to do
 * (chart / compute / plain-text answer) and replies with a small JSON
 * "envelope" describing that intent; the browser executes it against the
 * real rows so all numbers/charts stay exact (see comment below).
 */

// Talks to Databricks (network + secrets); must run on Node and never cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The route is a thin planner: it hands the model the dataset's schema + a
// small sample and asks *what* to do, returning a structured envelope. The
// browser then executes that envelope against the full rows it holds in memory
// (see lib/csv.ts), so all chart series and numbers are computed exactly —
// the model never does the arithmetic.
const SYSTEM_PROMPT = `You are a data analyst assistant for a single CSV dataset.
You do NOT compute numbers yourself. Instead you decide what the app should do and reply with a SINGLE JSON object, and nothing else — no prose, no markdown, no code fences.

Choose exactly one shape:

1. A chart request (user wants to visualize / plot / graph):
{"type":"chart","kind":"bar"|"line"|"pie","x":"<column>","y":"<column>","agg":"sum"|"avg"|"count"|"min"|"max"|"none","title":"<short title>"}
- "x" is the category/label column, "y" is the numeric column to measure.
- Use "agg":"count" when the user counts rows per category (then "y" may equal "x").
- Use "agg":"none" only to plot raw per-row values.

2. A numeric question (total, sum, average, count, min, max, possibly per group):
{"type":"compute","op":"sum"|"avg"|"count"|"min"|"max","column":"<numeric column>","groupBy":"<column or null>","phrasing":"<how to phrase the result, using {value} as a placeholder>"}
- Set "groupBy" to a column name to break the number down per category, else null.

3. Anything open-ended or descriptive (summaries, explanations, lookups, "what stands out"):
{"type":"text","answer":"<your answer, based only on the schema and sample rows>"}

Rules:
- Only use column names that appear in the provided schema. Never invent columns.
- Prefer "compute" over "text" whenever the answer is a single number or a per-group breakdown, so the app can calculate it exactly.
- Output must be valid JSON parseable by JSON.parse.`;

/** Pull the first balanced JSON object out of a model reply. */
function extractJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Handle a Data Explorer question. Expects JSON body `{ question, summary }`
 * where `summary` describes the dataset's schema/sample rows. Returns a JSON
 * envelope of shape `{type:"chart"|"compute"|"text", ...}` (see SYSTEM_PROMPT
 * above), or falls back to `{type:"text"}` if the model didn't return valid JSON.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const question: string = (body?.question ?? "").toString().trim();
    const summary: string = (body?.summary ?? "").toString();

    if (!question) {
      return Response.json(
        { error: "No question provided." },
        { status: 400 }
      );
    }

    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "system",
        content: `Dataset the user is asking about:\n\n${summary}`,
      },
      { role: "user", content: question },
    ];

    const raw = await chatCompletion(messages);
    const jsonText = extractJson(raw);

    if (!jsonText) {
      // Model didn't return JSON — surface its text as a plain answer.
      return Response.json({ type: "text", answer: raw.trim() });
    }

    let envelope: unknown;
    try {
      envelope = JSON.parse(jsonText);
    } catch {
      return Response.json({ type: "text", answer: raw.trim() });
    }

    return Response.json(envelope);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
