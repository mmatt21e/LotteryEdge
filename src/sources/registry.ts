import type { RawGame, LiteGame } from "../types.js";
import { scrapeNc } from "./nc.js";

/**
 * Registry of FETCH-BASED adapters the CLI can run directly (no browser).
 * Browser/JS states (VA lite, Wave-2 JS states) run via standalone Playwright
 * scripts in the workflow, not here.
 *
 * Adding a full-EV state = write src/sources/<key>.ts exporting an async
 * scrape() returning { source, games: RawGame[] } (tiers with per-tier odds,
 * OR set overallOdds/totalTickets on each game as the EV anchor), then append
 * it below.
 */
export interface FullSource {
  key: string;
  name: string;
  kind: "full";
  scrape: () => Promise<{ source: string; games: RawGame[] }>;
}
export interface LiteSource {
  key: string;
  name: string;
  kind: "lite";
  scrape: () => Promise<{ source: string; games: LiteGame[] }>;
}
export type CliSource = FullSource | LiteSource;

export const SOURCES: CliSource[] = [
  { key: "nc", name: "North Carolina", kind: "full", scrape: scrapeNc },
  // --- Wave 1 (easy Tier-A) states appended here ---
];

export const sourceKeys = (): string[] => SOURCES.map((s) => s.key);
export const getSource = (key: string): CliSource | undefined =>
  SOURCES.find((s) => s.key === key);
