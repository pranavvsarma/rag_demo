# Databricks notebook source
# MAGIC %md
# MAGIC # Automated doc ingestion → chunk → MERGE → trigger Vector Search sync
# MAGIC
# MAGIC Incrementally ingests new/changed files from the source Volume with
# MAGIC **Auto Loader**, chunks them, **MERGE**s the chunks into the Delta table
# MAGIC backing the RAG index, then fires a **TRIGGERED** sync on the Vector
# MAGIC Search index so Databricks re-embeds only what changed.
# MAGIC
# MAGIC Designed for **Free Edition**: runs on serverless, processes the backlog
# MAGIC and exits (`Trigger.AvailableNow`), and never leaves compute running.

# COMMAND ----------

# MAGIC %pip install --quiet pypdf databricks-vectorsearch
# MAGIC dbutils.library.restartPython()

# COMMAND ----------

# Parameters (overridable from the Job definition via base_parameters).
dbutils.widgets.text("catalog", "rag_demo")
dbutils.widgets.text("schema", "docs")
dbutils.widgets.text("volume_path", "/Volumes/rag_demo/docs/source_files")
dbutils.widgets.text("vs_endpoint", "rag_demo_endpoint")
dbutils.widgets.text(
    "checkpoint_path",
    "/Volumes/rag_demo/docs/pipeline_state/doc_chunks_ingest",
)
dbutils.widgets.text("chunk_size", "1000")
dbutils.widgets.text("chunk_overlap", "150")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
volume_path = dbutils.widgets.get("volume_path").rstrip("/")
vs_endpoint = dbutils.widgets.get("vs_endpoint")
checkpoint_path = dbutils.widgets.get("checkpoint_path").rstrip("/")
chunk_size = int(dbutils.widgets.get("chunk_size"))
chunk_overlap = int(dbutils.widgets.get("chunk_overlap"))

table = f"{catalog}.{schema}.doc_chunks"
index = f"{catalog}.{schema}.doc_chunks_index"

print(f"Source Volume : {volume_path}")
print(f"Delta table   : {table}")
print(f"VS index      : {index} (endpoint: {vs_endpoint})")
print(f"Checkpoint    : {checkpoint_path}")

# COMMAND ----------

# Ensure the target table exists with Change Data Feed on (required so the
# Delta Sync index can pick up row-level changes). No-op if it already exists.
spark.sql(
    f"""
    CREATE TABLE IF NOT EXISTS {table} (
      id     STRING,
      text   STRING,
      source STRING
    )
    TBLPROPERTIES (delta.enableChangeDataFeed = true)
    """
)

# COMMAND ----------

import io
import hashlib
from pypdf import PdfReader


def extract_text(path: str, content: bytes) -> str:
    """Decode a file's bytes to plain text. PDFs via pypdf; everything else
    (.md, .txt, ...) decoded as UTF-8."""
    if path.lower().endswith(".pdf"):
        try:
            reader = PdfReader(io.BytesIO(content))
            return "\n".join((page.extract_text() or "") for page in reader.pages)
        except Exception as e:  # a corrupt PDF shouldn't kill the whole batch
            print(f"  ! failed to parse {path}: {e}")
            return ""
    return content.decode("utf-8", errors="ignore")


def chunk_text(text: str, size: int, overlap: int) -> list[str]:
    """Fixed-size character chunks with overlap, over whitespace-normalized text."""
    text = " ".join(text.split())
    if not text:
        return []
    chunks, start = [], 0
    while start < len(text):
        end = min(start + size, len(text))
        chunks.append(text[start:end])
        if end == len(text):
            break
        start = end - overlap
    return chunks


def chunk_id(source: str, i: int) -> str:
    """Deterministic id so re-processing a file MERGEs (updates) instead of
    duplicating rows."""
    return hashlib.sha256(f"{source}::{i}".encode()).hexdigest()

# COMMAND ----------

from delta.tables import DeltaTable

_delta = DeltaTable.forName(spark, table)


def process_batch(batch_df, batch_id: int):
    """For each micro-batch of newly-arrived files: extract → chunk → MERGE.
    collect() is fine at personal scale (a handful of docs per run); at
    enterprise scale you'd chunk inside Spark instead of on the driver."""
    files = batch_df.collect()
    if not files:
        return

    rows = []
    for f in files:
        source = f["path"].split("/")[-1]
        text = extract_text(f["path"], f["content"])
        pieces = chunk_text(text, chunk_size, chunk_overlap)
        print(f"  {source}: {len(pieces)} chunk(s)")
        for i, piece in enumerate(pieces):
            rows.append((chunk_id(source, i), piece, source))

    if not rows:
        return

    updates = spark.createDataFrame(rows, "id string, text string, source string")
    (
        _delta.alias("t")
        .merge(updates.alias("s"), "t.id = s.id")
        .whenMatchedUpdateAll()
        .whenNotMatchedInsertAll()
        .execute()
    )
    print(f"  batch {batch_id}: merged {len(rows)} chunk(s)")

# COMMAND ----------

# Auto Loader: incremental, checkpointed read of only NEW files. binaryFile
# gives us raw bytes + path so we can parse PDFs and text uniformly. The
# pathGlobFilter keeps checkpoint/state files out of the ingest.
query = (
    spark.readStream.format("cloudFiles")
    .option("cloudFiles.format", "binaryFile")
    .option("pathGlobFilter", "*.{md,txt,pdf}")
    .load(volume_path)
    .writeStream.foreachBatch(process_batch)
    .option("checkpointLocation", checkpoint_path)
    .trigger(availableNow=True)  # process backlog, then stop — no idle compute
    .start()
)
query.awaitTermination()
print("Ingestion complete.")

# COMMAND ----------

# Fire a TRIGGERED sync so Vector Search re-embeds only the changed chunks.
# (Cheaper than CONTINUOUS, which would hold compute open on Free Edition.)
from databricks.vector_search.client import VectorSearchClient

vsc = VectorSearchClient()
idx = vsc.get_index(endpoint_name=vs_endpoint, index_name=index)
idx.sync()
print(f"Triggered sync on {index}.")
