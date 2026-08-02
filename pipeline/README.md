# Automated doc ingestion pipeline

Drop a document into the source Volume → it's chunked, MERGEd into the RAG
Delta table, and the Vector Search index re-embeds it — **no manual notebook
run, no always-on compute.**

```
New file in Volume ──(file-arrival trigger)──► Databricks Job (serverless)
                                                 Auto Loader → chunk → MERGE
                                                        │
                                                        ▼ (TRIGGERED sync)
                                                 Vector Search re-embeds changes
```

Files:
- `ingest_docs.py` — the notebook (Databricks source format; import as a notebook).
- `rag_demo-ingest.job.json` — the Job definition to import.

---

## Prerequisites (already true for this project)
- Catalog/schema `rag_demo.docs`, table `rag_demo.docs.doc_chunks`, and a
  **Delta Sync** Vector Search index `rag_demo.docs.doc_chunks_index` on
  endpoint `rag_demo_endpoint`.
- Source Volume `/Volumes/rag_demo/docs/source_files`.

---

## Step 1 — Create a Volume for pipeline state (one-time)
Auto Loader needs a durable checkpoint location, kept **separate** from the docs
so it isn't ingested. In a SQL cell or the SQL editor:

```sql
CREATE VOLUME IF NOT EXISTS rag_demo.docs.pipeline_state;
```

## Step 2 — Set the Vector Search index to TRIGGERED sync
If your index was created in CONTINUOUS mode, recreate/set it to **TRIGGERED**
so it only syncs when the job calls `.sync()` (CONTINUOUS holds compute open and
burns Free-Edition quota). You can check the mode in **Catalog → the index →
Details**. If you need to recreate it, use `pipeline_type="TRIGGERED"` in the
`create_delta_sync_index(...)` call.

## Step 3 — Import the notebook
1. In the Databricks workspace: **Workspace → Users → your user → (create a
   `rag_demo` folder) → ⋮ → Import**.
2. Import `pipeline/ingest_docs.py` (it's in Databricks notebook source format,
   so it lands as a runnable notebook `ingest_docs`).
3. Note its full path — you'll reference it in the Job. The Job JSON defaults to
   `/Workspace/Users/pranavvsarma.us@gmail.com/rag_demo/ingest_docs`; **edit that
   if your path differs.**

## Step 4 — (Optional) smoke-test the notebook by hand
Open the notebook and **Run all**. First run processes every existing file;
re-runs process only new ones (thanks to the Auto Loader checkpoint). Confirm
`doc_chunks` row count grew and the final cell prints "Triggered sync".

## Step 5 — Create the Job
**Option A — UI (import JSON):**
1. **Workflows → Create job → ⋮ (top-right) → "Edit as JSON"** (or *Switch to
   code version*).
2. Paste the contents of `rag_demo-ingest.job.json`, fix `notebook_path` if
   needed, **Save**.

**Option B — Databricks CLI:**
```bash
databricks jobs create --json @pipeline/rag_demo-ingest.job.json
```
(Configure the CLI once with `databricks configure` using your host + PAT.)

## Step 6 — Verify the trigger
The Job is created with a **file-arrival trigger** on the source Volume
(`UNPAUSED`). Test it:
1. Upload a new `.md`/`.txt`/`.pdf` into `/Volumes/rag_demo/docs/source_files/`
   (via Catalog Explorer, the CSV 📎 button writes elsewhere so use the Volume
   UI here).
2. Within ~1–2 min the Job kicks off (**Workflows → rag_demo-ingest → Runs**).
3. When it finishes, ask the app a question about the new document — the answer
   should now be grounded in it.

---

## Prefer a schedule instead of file-arrival?
Swap the `trigger` block in the JSON for a cron schedule:

```json
"schedule": {
  "quartz_cron_expression": "0 0 * * * ?",
  "timezone_id": "UTC",
  "pause_status": "UNPAUSED"
}
```
(The example runs hourly. Auto Loader still processes only new files each run.)

---

## Notes / tuning
- **Idempotent:** chunk ids are `sha256(source::index)`, so re-ingesting a file
  updates its chunks rather than duplicating them.
- **Chunking** is fixed-size (`chunk_size`/`chunk_overlap` params). Tune per your
  documents.
- **`Trigger.AvailableNow`** means each run drains the backlog and stops — no
  idle streaming compute.
- **Scale caveat:** `process_batch` uses `collect()` (driver-side parsing),
  which is fine for personal-scale doc counts. At enterprise scale you'd parse
  inside Spark (e.g., a UDF) and avoid `collect()`.
- **File types:** `.md`, `.txt`, `.pdf` (via `pathGlobFilter`). Add extensions
  there and handle them in `extract_text()`.
