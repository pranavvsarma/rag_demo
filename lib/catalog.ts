// Server-only catalog for the Data Explorer.
//
// Dataset metadata and saved reports live as two small JSON index files in the
// same Volume as the dataset files. Read-modify-write is safe here because the
// app is single-user by design (no auth, no concurrent writers).

import {
  deleteFile,
  getFileText,
  putFile,
  readJson,
  volumePath,
  writeJson,
} from "@/lib/volume";
import type { ChartType } from "@/lib/chart-types";
import type { Agg, DatasetFormat, TableColumn } from "@/lib/table";

const CATALOG_PATH = volumePath("catalog.json");
const REPORTS_PATH = volumePath("reports.json");

export interface DatasetMeta {
  id: string;
  name: string;
  description: string;
  format: DatasetFormat;
  tags: string[];
  columns: TableColumn[];
  rowCount: number;
  sizeBytes: number;
  uploadedAt: string;
}

export interface ChartConfig {
  type: ChartType;
  x: string;
  y: string;
  agg: Agg;
}

export interface Report {
  id: string;
  name: string;
  datasetId: string;
  chart: ChartConfig;
  createdAt: string;
}

/** Absolute Volume path of a dataset's raw file. */
export function datasetFilePath(meta: Pick<DatasetMeta, "id" | "format">) {
  return volumePath("datasets", `${meta.id}.${meta.format}`);
}

// ----- Datasets -----

export async function listDatasets(q?: string): Promise<DatasetMeta[]> {
  const all = await readJson<DatasetMeta[]>(CATALOG_PATH, []);
  const sorted = [...all].sort((a, b) =>
    b.uploadedAt.localeCompare(a.uploadedAt)
  );
  const needle = q?.trim().toLowerCase();
  if (!needle) return sorted;
  return sorted.filter((d) =>
    [d.name, d.description, ...d.tags]
      .join(" ")
      .toLowerCase()
      .includes(needle)
  );
}

export async function getDataset(id: string): Promise<DatasetMeta | null> {
  const all = await readJson<DatasetMeta[]>(CATALOG_PATH, []);
  return all.find((d) => d.id === id) ?? null;
}

export async function addDataset(meta: DatasetMeta): Promise<DatasetMeta> {
  const all = await readJson<DatasetMeta[]>(CATALOG_PATH, []);
  await writeJson(CATALOG_PATH, [...all, meta]);
  return meta;
}

/**
 * Remove a dataset: its raw file, its catalog entry, and any reports built on
 * it (which would otherwise dangle).
 */
export async function deleteDataset(id: string): Promise<boolean> {
  const all = await readJson<DatasetMeta[]>(CATALOG_PATH, []);
  const meta = all.find((d) => d.id === id);
  if (!meta) return false;

  await deleteFile(datasetFilePath(meta));
  await writeJson(
    CATALOG_PATH,
    all.filter((d) => d.id !== id)
  );

  const reports = await readJson<Report[]>(REPORTS_PATH, []);
  if (reports.some((r) => r.datasetId === id)) {
    await writeJson(
      REPORTS_PATH,
      reports.filter((r) => r.datasetId !== id)
    );
  }
  return true;
}

/** Fetch a dataset's raw file text from the Volume. */
export async function readDatasetFile(meta: DatasetMeta): Promise<string> {
  const text = await getFileText(datasetFilePath(meta));
  if (text === null) {
    throw new Error(`Dataset file missing in the Volume for "${meta.name}".`);
  }
  return text;
}

/** Write a dataset's raw file to the Volume. */
export async function writeDatasetFile(
  meta: Pick<DatasetMeta, "id" | "format">,
  body: ArrayBuffer | string
): Promise<void> {
  await putFile(datasetFilePath(meta), body);
}

// ----- Reports -----

export async function listReports(): Promise<Report[]> {
  const all = await readJson<Report[]>(REPORTS_PATH, []);
  return [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getReport(id: string): Promise<Report | null> {
  const all = await readJson<Report[]>(REPORTS_PATH, []);
  return all.find((r) => r.id === id) ?? null;
}

export async function addReport(report: Report): Promise<Report> {
  const all = await readJson<Report[]>(REPORTS_PATH, []);
  await writeJson(REPORTS_PATH, [...all, report]);
  return report;
}

export async function deleteReport(id: string): Promise<boolean> {
  const all = await readJson<Report[]>(REPORTS_PATH, []);
  if (!all.some((r) => r.id === id)) return false;
  await writeJson(
    REPORTS_PATH,
    all.filter((r) => r.id !== id)
  );
  return true;
}
