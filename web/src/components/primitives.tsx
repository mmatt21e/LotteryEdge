import type { Game } from "../types.js";
import { confidence, type ConfidenceLevel } from "../analytics.js";

export type SortKey =
  | "roi"
  | "topPrize"
  | "topLeft"
  | "topOdds"
  | "prizeGoalOdds"
  | "unsold"
  | "price";

/**
 * Minimum prize thresholds for the prize-goal filter chips.
 * min = 0 means no filtering.
 */
export const PRIZE_GOALS = [
  { min: 0, label: "Any prize" },
  { min: 100_000, label: "$100k+" },
  { min: 500_000, label: "$500k+" },
  { min: 1_000_000, label: "$1M+" },
] as const;

/**
 * Value-quality band for a game's ROI (relative value, not profitability).
 * Returns a theme-aware CSS variable so both themes stay readable.
 */
export function roiColor(roi: number): string {
  if (roi >= 0.9) return "var(--good)";
  if (roi >= 0.8) return "var(--ok)";
  if (roi >= 0.7) return "var(--warn)";
  return "var(--bad)";
}

/** Color for a signed dollar/cent figure: sign decides, never band quality. */
export const signColor = (n: number): string => (n >= 0 ? "var(--good)" : "var(--bad)");

/** Enter/Space activation for clickable non-button elements (cards). */
export const pressKeys = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};

/**
 * Default-sort demotion: a "low" confidence EV (brand-new or nearly-sold-out
 * game) is usually an artifact, so it ranks after every medium/high game
 * instead of spiking to the top of "Best value".
 */
export const lowConfRank = (g: Game): number =>
  confidence(g.computed.fractionRemaining).level === "low" ? 1 : 0;

export const CONF_COLOR: Record<ConfidenceLevel, string> = {
  high: "var(--good)",
  medium: "var(--warn)",
  low: "var(--bad)",
};

export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button className={`chip ${active ? "chip-on" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

export function Kpi({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent?: string;
  sub?: string;
}) {
  return (
    <div className="kpi">
      <div className="kpi-val" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      <div className="kpi-label">{label}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export const dirColor = (d: -1 | 0 | 1) =>
  d > 0 ? "var(--good)" : d < 0 ? "var(--bad)" : "var(--flat)";
export const dirLabel = (d: -1 | 0 | 1) => (d > 0 ? "improving ↗" : d < 0 ? "declining ↘" : "flat →");
