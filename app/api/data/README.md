# app/api/data

`route.ts` — the LLM *planner* endpoint used for in-chat questions about an attached CSV.

Given the dataset's schema and a small row sample, the model is asked only *what* to compute — it replies with a `chart` / `compute` / `text` envelope, never with actual numbers. The browser executes that envelope against the full row set it holds locally (`lib/csv.ts`), so every figure shown to the user is exact rather than model-generated. This mirrors the invariant enforced server-side by `datasets/[id]/aggregate`.
