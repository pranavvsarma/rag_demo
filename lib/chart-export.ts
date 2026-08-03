/**
 * Export a rendered chart as a PNG, with no extra dependencies: clone the live
 * <svg>, rasterize it through an <img> onto a canvas, then hand the canvas blob
 * to the browser as a download.
 *
 * Recharts draws the plot into the SVG but renders the legend as sibling HTML,
 * so callers pass the legend items and we paint them onto the canvas below the
 * plot — otherwise a pie export would be unlabelled slices.
 */

export interface LegendItem {
  label: string;
  color: string;
}

interface ExportOptions {
  /** Base name, without extension. */
  fileName: string;
  /** Device-pixel multiplier, so the file stays crisp when zoomed. */
  scale?: number;
  legend?: LegendItem[];
}

const FONT =
  'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const PADDING = 16;
const LEGEND_ROW_HEIGHT = 20;
const LEGEND_SWATCH = 10;
const LEGEND_GAP = 18;
const LEGEND_FONT_SIZE = 12;

function isDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** A transparent PNG is unreadable wherever it lands, so paint the page's bg. */
const background = () => (isDark() ? "#18181b" : "#ffffff");
const foreground = () => (isDark() ? "#e4e4e7" : "#18181b");

/** A standalone copy of the live SVG: explicit size, namespace and font. */
function serialize(svg: SVGSVGElement, width: number, height: number): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  // Inherited from the page in the DOM; must be inlined once detached.
  clone.style.fontFamily = FONT;
  return new XMLSerializer().serializeToString(clone);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not rasterize the chart."));
    img.src = src;
  });
}

function legendItemWidth(ctx: CanvasRenderingContext2D, label: string): number {
  return LEGEND_SWATCH + 6 + ctx.measureText(label).width + LEGEND_GAP;
}

/**
 * Lays legend entries out into rows that fit `width`. Paints them when `paint`
 * is set; either way returns the number of rows, so the canvas can be sized
 * before anything is drawn.
 */
function layoutLegend(
  ctx: CanvasRenderingContext2D,
  items: LegendItem[],
  width: number,
  top: number,
  paint: boolean
): number {
  ctx.font = `${LEGEND_FONT_SIZE}px ${FONT}`;
  ctx.textBaseline = "middle";

  let rows = 1;
  let x = PADDING;
  let y = top + LEGEND_ROW_HEIGHT / 2;

  for (const item of items) {
    const itemWidth = legendItemWidth(ctx, item.label);
    if (x > PADDING && x + itemWidth > width - PADDING) {
      rows += 1;
      x = PADDING;
      y += LEGEND_ROW_HEIGHT;
    }
    if (paint) {
      ctx.fillStyle = item.color;
      ctx.fillRect(x, y - LEGEND_SWATCH / 2, LEGEND_SWATCH, LEGEND_SWATCH);
      ctx.fillStyle = foreground();
      ctx.fillText(item.label, x + LEGEND_SWATCH + 6, y);
    }
    x += itemWidth;
  }

  return rows;
}

export async function downloadChartPng(
  source: SVGSVGElement,
  { fileName, scale = 2, legend = [] }: ExportOptions
): Promise<void> {
  const rect = source.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const plotHeight = Math.max(1, Math.round(rect.height));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");

  const rows = legend.length > 0 ? layoutLegend(ctx, legend, width, plotHeight, false) : 0;
  const legendHeight = rows > 0 ? rows * LEGEND_ROW_HEIGHT + PADDING : 0;
  const height = plotHeight + legendHeight;

  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  ctx.scale(scale, scale);

  ctx.fillStyle = background();
  ctx.fillRect(0, 0, width, height);

  const img = await loadImage(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      serialize(source, width, plotHeight)
    )}`
  );
  ctx.drawImage(img, 0, 0, width, plotHeight);

  if (rows > 0) layoutLegend(ctx, legend, width, plotHeight, true);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );
  if (!blob) throw new Error("Could not encode the image.");

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Filesystem-safe slug for the downloaded file name. */
export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "chart"
  );
}
