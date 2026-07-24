import type { WinnerRecord } from "../../types.js";

/**
 * Registry of winner-feed adapters — states that publicly post recent winners
 * WITH the retailer that sold the ticket. Fewer states publish this than
 * publish prizes-remaining, so this list is independent of the main SOURCES
 * registry. Each adapter returns the winners currently visible on the source;
 * the CLI accumulates them across runs (see mergeWinners in ../../index.ts).
 */
export interface WinnerSource {
  key: string;
  name: string;
  scrape: () => Promise<{ source: string; winners: WinnerRecord[] }>;
}

export const WINNER_SOURCES: WinnerSource[] = [
  // Populated per state as adapters are added (see src/sources/winners/*.ts).
];

export const winnerSourceKeys = (): string[] => WINNER_SOURCES.map((s) => s.key);
