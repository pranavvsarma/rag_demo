/**
 * Rasterize a rendered chart, with no extra dependencies: clone the live <svg>,
 * draw it through an <img> onto a canvas, and hand back either a download or a
 * data URL (which the PDF report embeds).
 *
 * Recharts draws the plot into the SVG but renders the legend as sibling HTML,
 * so callers pass the legend items and we paint them onto the canvas below the
 * plot — otherwise a pie export would be unlabelled slices.
 */

export interface LegendItem {
  label: string;
  color: string;
}

export interface RenderOptions {
  /** Device-pixel multiplier, so the image stays crisp when zoomed. */
  scale?: number;
  legend?: LegendItem[];
  /** Defaults to the page theme. The PDF forces light, since its pages are white. */
  theme?: "auto" | "light";
}

export interface RenderedChart {
  dataUrl: string;
  /** CSS-pixel size, i.e. before `scale` — the aspect ratio to lay out with. */
  width: number;
  height: number;
}

const FONT =
  'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const PADDING = 16;
const LEGEND_ROW_HEIGHT = 20;
const LEGEND_SWATCH = 10;
const LEGEND_GAP = 18;
const LEGEND_FONT_SIZE = 12;

function isDark(theme: "auto" | "light"): boolean {
  return (
    theme === "auto" &&
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** A transparent PNG is unreadable wherever it lands, so paint the page's bg. */
const background = (theme: "auto" | "light") =>
  isDark(theme) ? "#18181b" : "#ffffff";
const foreground = (theme: "auto" | "light") =>
  isDark(theme) ? "#e4e4e7" : "#18181b";

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
  paint: boolean,
  theme: "auto" | "light"
): number {
  ctx.font = `${LEGEND_FONT_SIZE}px ${FONT}`;
  ctx.textBaseline = "middle";

  let rows = 1;
  let x = PADDING;
  let y = top + LEGEND_ROW_HEIGHT / 2;

  for (const item of items) {
    const itemWidth =
      LEGEND_SWATCH + 6 + ctx.measureText(item.label).width + LEGEND_GAP;
    if (x > PADDING && x + itemWidth > width - PADDING) {
      rows += 1;
      x = PADDING;
      y += LEGEND_ROW_HEIGHT;
    }
    if (paint) {
      ctx.fillStyle = item.color;
      ctx.fillRect(x, y - LEGEND_SWATCH / 2, LEGEND_SWATCH, LEGEND_SWATCH);
      ctx.fillStyle = foreground(theme);
      ctx.fillText(item.label, x + LEGEND_SWATCH + 6, y);
    }
    x += itemWidth;
  }

  return rows;
}

/** The chart as a PNG data URL, legend included. */
export async function renderChartPng(
  source: SVGSVGElement,
  { scale = 2, legend = [], theme = "auto" }: RenderOptions = {}
): Promise<RenderedChart> {
  const rect = source.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const plotHeight = Math.max(1, Math.round(rect.height));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");

  const rows =
    legend.length > 0
      ? layoutLegend(ctx, legend, width, plotHeight, false, theme)
      : 0;
  const legendHeight = rows > 0 ? rows * LEGEND_ROW_HEIGHT + PADDING : 0;
  const height = plotHeight + legendHeight;

  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  ctx.scale(scale, scale);

  ctx.fillStyle = background(theme);
  ctx.fillRect(0, 0, width, height);

  const img = await loadImage(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      serialize(source, width, plotHeight)
    )}`
  );
  ctx.drawImage(img, 0, 0, width, plotHeight);

  if (rows > 0) layoutLegend(ctx, legend, width, plotHeight, true, theme);

  return { dataUrl: canvas.toDataURL("image/png"), width, height };
}

/** Hands a blob to the browser as a file download. */
export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Rasterize the chart (see `renderChartPng`) and trigger a `.png` download. */
export async function downloadChartPng(
  source: SVGSVGElement,
  { fileName, ...options }: RenderOptions & { fileName: string }
): Promise<void> {
  const { dataUrl } = await renderChartPng(source, options);
  const blob = await (await fetch(dataUrl)).blob();
  triggerDownload(blob, `${fileName}.png`);
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
