/**
 * Builds the "download this report as a PDF" artifact: a title block, the chart
 * as a raster image, and the aggregated series behind it as a table.
 *
 * The chart is rasterized from the live SVG (see `renderChartPng`) rather than
 * redrawn, so the PDF matches exactly what the user is looking at.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { renderChartPng, slugify, type LegendItem } from "./chart-export";
import type { SeriesPoint } from "./table";

interface ReportOptions {
  /** The report's headline — its saved name, or the dataset name if unsaved. */
  title: string;
  /** Dataset the report was built from. Omitted when it *is* the headline. */
  datasetName?: string;
  /** e.g. "bar · sum of revenue by region". */
  subtitle: string;
  /** Column headers for the data table. */
  xLabel: string;
  yLabel: string;
  series: SeriesPoint[];
  legend?: LegendItem[];
  /** Base name, without extension. Defaults to a slug of the title. */
  fileName?: string;
}

// A4 portrait in points, which is jsPDF's default unit.
const MARGIN = 48;
const INK = "#18181b"; // zinc-900
const MUTED = "#71717a"; // zinc-500
const RULE = "#d4d4d8"; // zinc-300
const HEADER_FILL = "#f4f4f5"; // zinc-100

/** Thousands separators, but only where the value is genuinely numeric. */
function formatValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Render a report to a single- or multi-page A4 PDF (title block, chart image,
 * then the underlying data as a table) and trigger a browser download.
 */
export async function downloadReportPdf(
  chartSvg: SVGSVGElement,
  {
    title,
    datasetName,
    subtitle,
    xLabel,
    yLabel,
    series,
    legend = [],
    fileName,
  }: ReportOptions
): Promise<void> {
  // The PDF page is white, so render the chart light regardless of page theme.
  const chart = await renderChartPng(chartSvg, { legend, theme: "light" });

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - MARGIN * 2;

  // Title block, stacked top-down: the report's name, then what it was built
  // from, then how. `cursor` is the baseline of the line just drawn.
  let cursor = MARGIN;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(INK);
  doc.text(title, MARGIN, cursor);

  if (datasetName) {
    cursor += 17;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(INK);
    doc.text(datasetName, MARGIN, cursor);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(MUTED);
  cursor += 16;
  doc.text(subtitle, MARGIN, cursor);
  cursor += 14;
  doc.text(`Generated ${new Date().toLocaleString()}`, MARGIN, cursor);

  doc.setDrawColor(RULE);
  doc.line(MARGIN, cursor + 12, pageWidth - MARGIN, cursor + 12);

  // Scale the chart to the text column, preserving its on-screen aspect ratio.
  const imageWidth = contentWidth;
  const imageHeight = (chart.height / chart.width) * imageWidth;
  const imageTop = cursor + 28;
  doc.addImage(chart.dataUrl, "PNG", MARGIN, imageTop, imageWidth, imageHeight);

  autoTable(doc, {
    startY: imageTop + imageHeight + 24,
    margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN },
    head: [[xLabel, yLabel]],
    body: series.map((point) => [point.x, formatValue(point.y)]),
    styles: { font: "helvetica", fontSize: 9, cellPadding: 6, textColor: INK },
    headStyles: { fillColor: HEADER_FILL, textColor: INK, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" } },
    // Long series run past one page; the header repeats on each.
    theme: "grid",
    tableLineColor: RULE,
    tableLineWidth: 0.5,
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(MUTED);
    doc.text(
      `Page ${page} of ${pageCount}`,
      pageWidth - MARGIN,
      doc.internal.pageSize.getHeight() - 24,
      { align: "right" }
    );
  }

  doc.save(`${fileName ?? slugify(title)}.pdf`);
}
