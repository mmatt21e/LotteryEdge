import type { RawGame, LiteGame } from "../types.js";
import { scrapeNc } from "./nc.js";
import { scrapeSc } from "./sc.js";
import { scrapeCa } from "./ca.js";
import { scrapeMs } from "./ms.js";
import { scrapeMo } from "./mo.js";
import { scrapeMd } from "./md.js";
import { scrapeWa } from "./wa.js";
import { scrapeLa } from "./la.js";
import { scrapeAr } from "./ar.js";
import { scrapeCt } from "./ct.js";
import { scrapeIa } from "./ia.js";
import { scrapeId } from "./id.js";
import { scrapeTx } from "./tx.js";
import { scrapeOh } from "./oh.js";
import { scrapeOk } from "./ok.js";
import { scrapeMa } from "./ma.js";
import { scrapeKy } from "./ky.js";
import { scrapeMi } from "./mi.js";
import { scrapeFl } from "./fl.js";
import { scrapeVt } from "./vt.js";
import { scrapeNh } from "./nh.js";
import { scrapeWv } from "./wv.js";
import { scrapeRi } from "./ri.js";

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
  // --- Wave 1 (easy Tier-A) ---
  { key: "sc", name: "South Carolina", kind: "full", scrape: scrapeSc },
  { key: "ca", name: "California", kind: "full", scrape: scrapeCa },
  { key: "ms", name: "Mississippi", kind: "full", scrape: scrapeMs },
  { key: "mo", name: "Missouri", kind: "full", scrape: scrapeMo },
  { key: "md", name: "Maryland", kind: "full", scrape: scrapeMd },
  { key: "wa", name: "Washington", kind: "full", scrape: scrapeWa },
  { key: "la", name: "Louisiana", kind: "full", scrape: scrapeLa },
  { key: "ar", name: "Arkansas", kind: "full", scrape: scrapeAr },
  { key: "ct", name: "Connecticut", kind: "full", scrape: scrapeCt },
  { key: "ia", name: "Iowa", kind: "full", scrape: scrapeIa },
  // --- Wave 2 (fixed held + discovered APIs) ---
  { key: "id", name: "Idaho", kind: "full", scrape: scrapeId },
  { key: "tx", name: "Texas", kind: "full", scrape: scrapeTx },
  { key: "oh", name: "Ohio", kind: "full", scrape: scrapeOh },
  { key: "ok", name: "Oklahoma", kind: "full", scrape: scrapeOk },
  { key: "ma", name: "Massachusetts", kind: "full", scrape: scrapeMa },
  { key: "ky", name: "Kentucky", kind: "full", scrape: scrapeKy },
  { key: "mi", name: "Michigan", kind: "full", scrape: scrapeMi },
  { key: "fl", name: "Florida", kind: "full", scrape: scrapeFl },
  { key: "nh", name: "New Hampshire", kind: "full", scrape: scrapeNh },
  { key: "wv", name: "West Virginia", kind: "full", scrape: scrapeWv },
  { key: "ri", name: "Rhode Island", kind: "full", scrape: scrapeRi },
  { key: "vt", name: "Vermont", kind: "lite", scrape: scrapeVt },
];

export const sourceKeys = (): string[] => SOURCES.map((s) => s.key);
export const getSource = (key: string): CliSource | undefined =>
  SOURCES.find((s) => s.key === key);
