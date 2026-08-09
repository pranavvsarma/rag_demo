// Chart vocabulary shared by the Explorer's server routes and client
// components. Kept in its own module (no server imports) so Client Components
// can pull the values, not just the types.

export type ChartType = "bar" | "line" | "pie";

export const CHART_TYPES: ChartType[] = ["bar", "line", "pie"];

/** Type guard: true if `v` is one of the supported chart type strings. */
export function isChartType(v: string): v is ChartType {
  return (CHART_TYPES as string[]).includes(v);
}
