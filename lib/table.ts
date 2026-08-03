// Tabular helpers for the Data Explorer. These run in the Node runtime (API
// routes) rather than the browser, because the Explorer keeps dataset files in
// a Databricks Volume and parses them server-side on each request.
//
// Parsing uses papaparse, which is already a project dependency (lib/csv.ts
// uses it for the browser-side "chat with your CSV" flow). Datasets are assumed
// small — the upload route enforces a size cap, since everything here is
// in-memory.

import Papa from "papaparse";

export type ColumnType = "number" | "string" | "date";

export interface TableColumn {
  name: string;
  type: ColumnType;
}

export type Cell = string | number | boolean | null;

export interface Table {
  columns: TableColumn[];
  rows: Record<string, Cell>[];
}

export type DatasetFormat = "csv" | "json";

export type Agg = "sum" | "avg" | "count" | "min" | "max";

export const AGGS: Agg[] = ["sum", "avg", "count", "min", "max"];

export function isAgg(v: string): v is Agg {
  return (AGGS as string[]).includes(v);
}

// ----- Parsing -----

/** Parse raw file text into rows + typed columns. */
export function parseTable(text: string, format: DatasetFormat): Table {
  const rows = format === "csv" ? parseCsv(text) : parseJsonRows(text);
  return { columns: inferColumns(rows), rows };
}

function parseCsv(text: string): Record<string, Cell>[] {
  const result = Papa.parse<Record<string, Cell>>(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });
  return result.data.filter((r) => r && Object.keys(r).length > 0);
}

/**
 * Accepts either a top-level array of objects or an object wrapping one (e.g.
 * `{ "data": [...] }`), which is the common shape for hand-exported JSON.
 */
function parseJsonRows(text: string): Record<string, Cell>[] {
  const parsed: unknown = JSON.parse(text);

  let arr: unknown;
  if (Array.isArray(parsed)) {
    arr = parsed;
  } else if (parsed && typeof parsed === "object") {
    arr = Object.values(parsed as Record<string, unknown>).find((v) =>
      Array.isArray(v)
    );
  }

  if (!Array.isArray(arr)) {
    throw new Error("JSON must be an array of objects.");
  }

  return arr.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("JSON must be an array of objects.");
    }
    const row: Record<string, Cell> = {};
    for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
      // Flatten anything non-scalar so the table stays rectangular.
      row[k] =
        v === null || v === undefined
          ? null
          : typeof v === "object"
            ? JSON.stringify(v)
            : (v as Cell);
    }
    return row;
  });
}

// ----- Column typing -----

// Matches ISO dates (2024-05-01, 2024-05-01T12:00:00Z) and US-style M/D/YYYY.
const DATE_RE = /^(\d{4}-\d{2}-\d{2}([T ].*)?|\d{1,2}\/\d{1,2}\/\d{4})$/;

/** Collect the union of keys across rows, preserving first-seen order. */
function fieldNames(rows: Record<string, Cell>[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) {
        seen.add(k);
        order.push(k);
      }
    }
  }
  return order;
}

/**
 * Classify each column so the chart builder can offer sensible axes: numeric
 * columns for Y, categorical/date columns for X. Sampling the first 50
 * non-empty values is enough to classify.
 */
export function inferColumns(rows: Record<string, Cell>[]): TableColumn[] {
  return fieldNames(rows).map((name) => ({ name, type: inferType(rows, name) }));
}

function inferType(rows: Record<string, Cell>[], field: string): ColumnType {
  let seen = 0;
  let allNumeric = true;
  let allDate = true;

  for (const row of rows) {
    const v = row[field];
    if (v === null || v === undefined || v === "") continue;
    seen++;

    if (typeof v !== "number" && Number.isNaN(Number(v))) allNumeric = false;
    if (typeof v !== "string" || !DATE_RE.test(v)) allDate = false;

    if (seen >= 50 || (!allNumeric && !allDate)) break;
  }

  if (seen === 0) return "string";
  if (allNumeric) return "number";
  if (allDate) return "date";
  return "string";
}

// ----- Serialization -----

export function fmtCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

/** RFC-4180 quoting: wrap in quotes when the value contains , " or a newline. */
function csvEscape(v: Cell): string {
  const s = fmtCell(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(
  columns: TableColumn[],
  rows: Record<string, Cell>[]
): string {
  const header = columns.map((c) => csvEscape(c.name)).join(",");
  const body = rows.map((r) =>
    columns.map((c) => csvEscape(r[c.name] ?? null)).join(",")
  );
  return [header, ...body].join("\r\n");
}

// ----- Aggregation -----

export interface SeriesPoint {
  x: string;
  y: number;
}

function toNumber(v: Cell): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isNaN(n) ? null : n;
}

function reduceValues(values: number[], agg: Agg): number {
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
  }
}

/**
 * Group rows on `x` and aggregate `y`. `agg: "count"` counts rows per group and
 * ignores `y`. Group order is first-seen, which keeps time-ordered CSVs in
 * their natural order on a line chart.
 */
export function aggregateSeries(
  rows: Record<string, Cell>[],
  x: string,
  y: string,
  agg: Agg
): SeriesPoint[] {
  const order: string[] = [];
  const groups = new Map<string, number[]>();

  for (const row of rows) {
    const key = fmtCell(row[x]);
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

  return order.map((key) => ({
    x: key,
    y: reduceValues(groups.get(key)!, agg),
  }));
}
