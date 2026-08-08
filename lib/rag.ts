// Server-only RAG pipeline stages: query condensation, pointwise reranking,
// and relevance floor. All stages fail open — errors degrade to today's
// baseline behavior rather than propagating.

import { retrieve, chatCompletion, type Source, type ChatMessage } from "./databricks";

// ── Config from env vars ────────────────────────────────────────────────────

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (!v) return fallback;
  return v !== "0";
}

const QUERY_REWRITE_ENABLED = () => envBool("RAG_QUERY_REWRITE", true);
const RERANK_ENABLED = () => envBool("RAG_RERANK", true);
const ABSTAIN_ENABLED = () => envBool("RAG_ABSTAIN", true);
const CANDIDATE_POOL = () => envInt("RAG_CANDIDATE_POOL", 10);
const TOP_K = () => envInt("RAG_TOP_K", 5);
const RERANK_CONCURRENCY = () => envInt("RAG_RERANK_CONCURRENCY", 3);
const MIN_RERANK_SCORE = () => envInt("RAG_MIN_RERANK_SCORE", 2);

// ── Types ───────────────────────────────────────────────────────────────────

export interface CondenseResult {
  searchQuery: string;
  rewritten: boolean;
}

export interface RerankResult {
  sources: Source[];
  reranked: boolean;
}

export interface FloorResult {
  kept: Source[];
  droppedCount: number;
  abstain: boolean;
}

export interface RetrievalMeta {
  originalQuery: string;
  searchQuery: string;
  rewritten: boolean;
  reranked: boolean;
  candidateCount: number;
  droppedByFloor: number;
  abstained: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

/** Parse the first integer 0-10 from a model reply. Returns null if none found. */
function parseScore(text: string): number | null {
  const match = text.match(/\b(\d{1,2})\b/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  if (n < 0 || n > 10) return null;
  return n;
}

/** Scale a Vector Search cosine-similarity score (roughly 0-1) to 0-10. */
function vectorScoreToRerank(score: number): number {
  return Math.min(10, Math.max(0, Math.round(score * 10)));
}

// ── Stage 1: query condensation ─────────────────────────────────────────────

/**
 * Condense conversation history into a self-contained search query.
 * Skipped on the first turn (nothing to condense), when disabled, or on any
 * error — in all those cases the original question is returned unchanged.
 */
export async function condenseQuery(
  messages: ChatMessage[],
  signal?: AbortSignal
): Promise<CondenseResult> {
  const userMessages = messages.filter((m) => m.role === "user");
  const lastQuery = userMessages[userMessages.length - 1]?.content?.trim() ?? "";

  // Nothing to condense on the very first turn.
  if (userMessages.length <= 1 || !QUERY_REWRITE_ENABLED()) {
    return { searchQuery: lastQuery, rewritten: false };
  }

  try {
    // Send the last 6 messages for context — enough to capture a multi-turn
    // thread without overflowing a tight token budget.
    const recent = messages.slice(-6);
    const historyText = recent
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const condensedRaw = await chatCompletion(
      [
        {
          role: "system",
          content:
            "You are a search query rewriter. Given a conversation history, output ONLY a single standalone search query that captures what the user is currently asking about. No explanation, no punctuation at the end, no quotes — just the query on one line.",
        },
        {
          role: "user",
          content: `Conversation:\n${historyText}\n\nRewrite the final question as a standalone search query:`,
        },
      ],
      { maxTokens: 60, temperature: 0, signal }
    );

    const condensed = condensedRaw.trim().split("\n")[0];

    // Sanity guards — a bad rewrite is worse than no rewrite.
    if (condensed.length === 0 || condensed.length > 300) {
      return { searchQuery: lastQuery, rewritten: false };
    }

    return { searchQuery: condensed, rewritten: true };
  } catch {
    return { searchQuery: lastQuery, rewritten: false };
  }
}

// ── Stage 2: pointwise LLM reranking ────────────────────────────────────────

/**
 * Score each candidate with a single LLM call, run in bounded-concurrency
 * batches. Per-candidate failures fall back to a vector-score proxy so no
 * chunk is silently lost. If the whole stage fails, returns the first topK
 * in vector order with reranked=false.
 */
export async function rerankSources(
  query: string,
  sources: Source[],
  topK: number,
  signal?: AbortSignal
): Promise<RerankResult> {
  if (!RERANK_ENABLED() || sources.length === 0) {
    return { sources: sources.slice(0, topK), reranked: false };
  }

  try {
    const scored = await mapWithConcurrency(
      sources,
      RERANK_CONCURRENCY(),
      async (src): Promise<Source> => {
        try {
          const chunkText = src.text.slice(0, 1200);
          const raw = await chatCompletion(
            [
              {
                role: "system",
                content:
                  "You are a relevance scorer. Given a search query and a document chunk, reply with ONLY a single integer from 0 to 10. 0 = completely irrelevant. 10 = directly and fully answers the query. No explanation.",
              },
              {
                role: "user",
                content: `Query: ${query}\n\nDocument chunk:\n${chunkText}`,
              },
            ],
            { maxTokens: 4, temperature: 0, signal }
          );

          const score = parseScore(raw);
          return {
            ...src,
            rerankScore: score ?? vectorScoreToRerank(src.score),
          };
        } catch {
          // Per-candidate failure: proxy from vector score rather than dropping.
          return { ...src, rerankScore: vectorScoreToRerank(src.score) };
        }
      }
    );

    // Sort by rerank score desc; tie-break by original vector score desc.
    scored.sort((a, b) => {
      const diff = (b.rerankScore ?? 0) - (a.rerankScore ?? 0);
      return diff !== 0 ? diff : b.score - a.score;
    });

    return { sources: scored.slice(0, topK), reranked: true };
  } catch {
    return { sources: sources.slice(0, topK), reranked: false };
  }
}

// ── Stage 3: relevance floor ─────────────────────────────────────────────────

/**
 * Filter chunks below RAG_MIN_RERANK_SCORE and optionally abstain when none
 * survive. Only armed when reranking actually succeeded — if reranking failed
 * there are no meaningful scores and abstaining would misdiagnose an infra
 * failure as a corpus gap.
 */
export function applyRelevanceFloor(
  sources: Source[],
  reranked: boolean
): FloorResult {
  // Disarmed: pass through as-is.
  if (!reranked || !RERANK_ENABLED()) {
    return { kept: sources, droppedCount: 0, abstain: false };
  }

  const floor = MIN_RERANK_SCORE();
  const kept = sources.filter((s) => (s.rerankScore ?? 0) >= floor);
  const droppedCount = sources.length - kept.length;
  const abstain = ABSTAIN_ENABLED() && kept.length === 0;

  return { kept, droppedCount, abstain };
}

// ── Full pipeline entry point ────────────────────────────────────────────────

export interface PipelineResult {
  sources: Source[];
  meta: RetrievalMeta;
}

/**
 * Run the full four-stage retrieval pipeline:
 *   condense → retrieve wide → rerank → floor
 *
 * Returns the final source list and metadata for the first-line protocol frame
 * and server-side logging.
 */
export async function runRetrievalPipeline(
  messages: ChatMessage[],
  signal?: AbortSignal
): Promise<PipelineResult> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const originalQuery = lastUser?.content?.trim() ?? "";

  // Stage 1: condense
  const { searchQuery, rewritten } = await condenseQuery(messages, signal);

  // Stage 2: retrieve wide
  const pool = CANDIDATE_POOL();
  const topK = TOP_K();
  const candidates = await retrieve(searchQuery, pool, signal);

  // Stage 3: rerank
  const { sources: ranked, reranked } = await rerankSources(
    searchQuery,
    candidates,
    topK,
    signal
  );

  // Stage 4: floor
  const { kept, droppedCount, abstain } = applyRelevanceFloor(ranked, reranked);

  const meta: RetrievalMeta = {
    originalQuery,
    searchQuery,
    rewritten,
    reranked,
    candidateCount: candidates.length,
    droppedByFloor: droppedCount,
    abstained: abstain,
  };

  return { sources: kept, meta };
}
