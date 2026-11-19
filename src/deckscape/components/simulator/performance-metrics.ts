/** Opt-in counters for isolated browser profiling; values never include game data. */
export type SimulatorMetric =
  | "boardLayout" | "boardPaint" | "cardVisualBuild" | "cardVisualReuse"
  | "hudPaint" | "hudVisualBuild";

declare global {
  interface Window {
    __deckscapeSimulatorMetrics?: Partial<Record<SimulatorMetric, number>>;
  }
}

export function recordSimulatorMetric(metric: SimulatorMetric) {
  const counters = window.__deckscapeSimulatorMetrics;
  if (counters) counters[metric] = (counters[metric] ?? 0) + 1;
}
