// Client-side CSV utilities for the "chat with your CSV" feature.
//
// Parsing runs in the browser (papaparse). The deterministic aggregation
// helpers here are the trust anchor of the feature: the LLM only *chooses*
// which columns / aggregation to use (see /api/data), while all numbers —
// chart series and computed answers — are calculated here from the real rows.
// That keeps charts and numeric answers exact regardless of dataset size.

import Papa from "papaparse";

export type ColumnType = "number" | "string";

export interface Column {
  name: string;
  type: ColumnType;
}

export type Cell = string | number | null;

export interface Dataset {
  /** Original file name, also used as the Volume object name. */
  name: string;
  columns: Column[];
  rows: Record<string, Cell>[];
}

// ----- The structured reply the model must return (see /api/data) -----

export type ChartKind = "bar" | "line" | "pie";
export type Agg = "sum" | "avg" | "count" | "min" | "max" | "none";
export type ComputeOp = "sum" | "avg" | "count" | "min" | "max";

export interface ChartEnvelope {
  type: "chart";
  kind: ChartKind;
  x: string;
  y: string;
  agg: Agg;
  title?: string;
}

export interface ComputeEnvelope {
  type: "compute";
  op: ComputeOp;
  column: string;
  groupBy?: string | null;
  phrasing?: string;
}

export interface TextEnvelope {
  type: "text";
  answer: string;
}

export type Envelope = ChartEnvelope | ComputeEnvelope | TextEnvelope;

// ----- Parsing -----

const PARSE_OPTIONS = {
  header: true,
  dynamicTyping: true,
  skipEmptyLines: true,
} as const;

/** Shape a papaparse result into a typed Dataset. Throws on a headerless CSV. */
function toDataset(
  name: string,
  result: Papa.ParseResult<Record<string, Cell>>
): Dataset {
  const rows = result.data.filter((r) => r && Object.keys(r).length > 0);
  const fields = result.meta.fields ?? [];
  if (fields.length === 0) {
    throw new Error("No columns found in CSV.");
  }
  return {
    name,
    columns: fields.map((field) => ({
      name: field,
      type: inferType(rows, field),
    })),
    rows,
  };
}

/** Parse a CSV File in the browser into a typed Dataset. */
export function parseCsvFile(file: File): Promise<Dataset> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, Cell>>(file, {
      ...PARSE_OPTIONS,
      complete: (result) => {
        try {
          resolve(toDataset(file.name, result));
        } catch (e) {
          reject(e);
        }
      },
      error: (err) => reject(err),
    });
  });
}

/**
 * Parse CSV text that is already in memory. Used for datasets pulled from the
 * Data Explorer catalog, which arrive as a string from the download route
 * rather than as a File picked by the user.
 */
export function parseCsvText(text: string, name: string): Dataset {
  return toDataset(name, Papa.parse<Record<string, Cell>>(text, PARSE_OPTIONS));
}

/** A column is numeric if every non-empty value in it parses as a number. */
function inferType(rows: Record<string, Cell>[], field: string): ColumnType {
  let seen = 0;
  for (const row of rows) {
    const v = row[field];
    if (v === null || v === undefined || v === "") continue;
    seen++;
    if (typeof v !== "number" && Number.isNaN(Number(v))) return "string";
    if (seen >= 50) break; // sampling is enough to classify
  }
  return seen > 0 ? "number" : "string";
}

// ----- Prompt summary (sent to the model, not the full data) -----

/**
 * A compact text description of the dataset for the LLM: schema, row count,
 * and a small sample. We deliberately never send every row — it wouldn't fit
 * for large files and isn't needed, since the app does the math itself.
 */
export function datasetSummary(ds: Dataset, sampleSize = 15): string {
  const schema = ds.columns
    .map((c) => `- ${c.name} (${c.type})`)
    .join("\n");
  const sample = ds.rows.slice(0, sampleSize);
  const sampleText = sample
    .map((r) => ds.columns.map((c) => fmt(r[c.name])).join(" | "))
    .join("\n");
  const headerLine = ds.columns.map((c) => c.name).join(" | ");

  return [
    `File: ${ds.name}`,
    `Rows: ${ds.rows.length}`,
    `Columns:\n${schema}`,
    `Sample (first ${sample.length} rows):`,
    headerLine,
    sampleText,
  ].join("\n");
}

function fmt(v: Cell): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

// ----- Deterministic aggregation (charts + computed answers) -----

function toNumber(v: Cell): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isNaN(n) ? null : n;
}

function reduceValues(values: number[], agg: Agg | ComputeOp): number {
  if (values.length === 0) return 0;
  switch (agg) {
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "avg":
      return values.reduce((a, b) => a + b, 0) / values.length;
    case "count":
      return values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    default:
      return values.reduce((a, b) => a + b, 0);
  }
}

export interface Series {
  labels: string[];
  values: number[];
}

/**
 * Build a chart series by grouping rows on `x` and aggregating `y`.
 * `agg: "none"` plots the raw y value of each row against its x label.
 */
export function aggregateSeries(
  ds: Dataset,
  x: string,
  y: string,
  agg: Agg
): Series {
  if (agg === "none") {
    const labels: string[] = [];
    const values: number[] = [];
    for (const row of ds.rows) {
      const n = toNumber(row[y]);
      if (n === null) continue;
      labels.push(fmt(row[x]));
      values.push(n);
    }
    return { labels, values };
  }

  // Preserve first-seen order of group labels.
  const order: string[] = [];
  const groups = new Map<string, number[]>();
  for (const row of ds.rows) {
    const key = fmt(row[x]);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    if (agg === "count") {
      groups.get(key)!.push(1);
    } else {
      const n = toNumber(row[y]);
      if (n !== null) groups.get(key)!.push(n);
    }
  }

  return {
    labels: order,
    values: order.map((k) => reduceValues(groups.get(k)!, agg)),
  };
}

export type ComputeResult =
  | { kind: "scalar"; value: number }
  | { kind: "grouped"; series: Series };

/** Exact numeric computation for text answers (Option B). */
export function computeOp(
  ds: Dataset,
  op: ComputeOp,
  column: string,
  groupBy?: string | null
): ComputeResult {
  if (groupBy) {
    return { kind: "grouped", series: aggregateSeries(ds, groupBy, column, op) };
  }
  if (op === "count") {
    return { kind: "scalar", value: ds.rows.length };
  }
  const values = ds.rows
    .map((r) => toNumber(r[column]))
    .filter((n): n is number => n !== null);
  return { kind: "scalar", value: reduceValues(values, op) };
}

/** Round for display without importing a formatting lib. */
export function pretty(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
