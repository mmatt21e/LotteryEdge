import type { WinnerRecord } from "../../types.js";
import { scrapeScWinners } from "./sc.js";
import { scrapeMoWinners } from "./mo.js";
import { scrapeLaWinners } from "./la.js";
import { scrapeTxWinners } from "./tx.js";
import { scrapeMiWinners } from "./mi.js";

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
  /**
   * Return the winners currently posted by the source. `knownIds` holds the
   * source-native ids already accumulated in data/winners-<key>.json —
   * adapters that need one fetch per winner (LA) skip those and return only
   * new records; the CLI's merge carries the old ones forward either way.
   */
  scrape: (knownIds?: ReadonlySet<string>) => Promise<{ source: string; winners: WinnerRecord[] }>;
}

export const WINNER_SOURCES: WinnerSource[] = [
  { key: "sc", name: "South Carolina", scrape: scrapeScWinners },
  { key: "mo", name: "Missouri", scrape: scrapeMoWinners },
  { key: "la", name: "Louisiana", scrape: scrapeLaWinners },
  { key: "tx", name: "Texas", scrape: scrapeTxWinners },
  { key: "mi", name: "Michigan", scrape: scrapeMiWinners },
];
// Not covered (documented for future passes): FL posts only press-released
// top prizes in prose; CA publishes winners only as PDF press releases;
// KY's gallery is ~17 cards with prose-only retailers; NC/GA/MS/AR are
// prose press releases (adapters in progress / see git history).

export const winnerSourceKeys = (): string[] => WINNER_SOURCES.map((s) => s.key);
