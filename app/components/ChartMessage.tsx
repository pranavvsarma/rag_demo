"use client";

import { useRef } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  type ChartOptions,
  type ChartData,
} from "chart.js";
import { Bar, Line, Pie } from "react-chartjs-2";
import type { ChartPayload } from "@/app/hooks/useChat";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

// Fixed palette — readable on the always-white chart card and exported PNG.
const PALETTE = [
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#db2777",
  "#0891b2",
  "#7c3aed",
  "#dc2626",
  "#65a30d",
  "#0d9488",
  "#c026d3",
];

const AXIS = "#52525b"; // zinc-600

export function ChartMessage({ chart }: { chart: ChartPayload }) {
  // The chart renders into a <canvas>; we read it back for the PNG export.
  const containerRef = useRef<HTMLDivElement>(null);

  const title = chart.title || "Chart";
  const isPie = chart.kind === "pie";
  const colors = chart.labels.map((_, i) => PALETTE[i % PALETTE.length]);

  const data: ChartData<"bar" | "line" | "pie"> = {
    labels: chart.labels,
    datasets: [
      {
        label: title,
        data: chart.values,
        backgroundColor: isPie ? colors : chart.kind === "bar" ? colors : "rgba(37,99,235,0.15)",
        borderColor: isPie ? "#ffffff" : "#2563eb",
        borderWidth: isPie ? 2 : 2,
        pointBackgroundColor: "#2563eb",
        fill: chart.kind === "line",
        tension: 0.3,
      },
    ],
  };

  const options: ChartOptions<"bar" | "line" | "pie"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: isPie, position: "bottom", labels: { color: AXIS } },
      title: { display: true, text: title, color: "#18181b" },
      tooltip: { enabled: true },
    },
    scales: isPie
      ? undefined
      : {
          x: { ticks: { color: AXIS }, grid: { color: "rgba(0,0,0,0.06)" } },
          y: { ticks: { color: AXIS }, grid: { color: "rgba(0,0,0,0.06)" } },
        },
  };

  function download() {
    const source = containerRef.current?.querySelector("canvas");
    if (!source) return;
    // Composite onto a white background so the PNG isn't transparent.
    const out = document.createElement("canvas");
    out.width = source.width;
    out.height = source.height;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(source, 0, 0);

    const a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = `${title.replace(/[^\w.\- ]+/g, "_")}.png`;
    a.click();
  }

  return (
    <div className="w-full rounded-2xl border border-black/10 bg-white p-3 shadow-sm">
      <div ref={containerRef} className="relative h-64 w-full">
        {chart.kind === "bar" && <Bar data={data as ChartData<"bar">} options={options as ChartOptions<"bar">} />}
        {chart.kind === "line" && <Line data={data as ChartData<"line">} options={options as ChartOptions<"line">} />}
        {chart.kind === "pie" && <Pie data={data as ChartData<"pie">} options={options as ChartOptions<"pie">} />}
      </div>
      <div className="mt-2 flex justify-end">
        <button
          onClick={download}
          className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-black/[0.04]"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M7 10l5 5 5-5" />
            <path d="M12 15V3" />
          </svg>
          Download PNG
        </button>
      </div>
    </div>
  );
}
