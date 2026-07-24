import * as cheerio from "cheerio";
import { fetchText } from "../http.js";
import { num } from "../parse.js";
import { parseUsDate } from "./la.js";
import type { WinnerRecord } from "../../types.js";

/**
 * South Carolina "Winners Report" — the richest structured winner source:
 * one server-rendered table of EVERY claimed prize ≥ $500 over a rolling
 * ~3-month window (~12,500 rows), each with claim date, prize, game,
 * retailer name, street address, city, and county. No winner names.
 *
 * The page is ~8.5 MB, so it's fetched once per daily run with a long
 * timeout. Rows are returned newest-first; the CLI cap keeps the most
 * recent slice and the merge accumulates history across runs.
 */
const REPORT_URL = "https://www.sceducationlottery.com/Games/WinnersReport";

/** SC draw games (mixed-case in the report); everything else is a scratcher. */
const DRAW_GAMES = new Set(
  [
    "pick 3",
    "pick 4",
    "palmetto cash 5",
    "mega millions",
    "megamillions",
    "powerball",
    "cash pop",
    "lucky for life",
  ].map((s) => s.toLowerCase()),
);

/** "07/22/2026" -> "2026-07-22" (also tolerates "July 22, 2026"). */
function scDate(s: string): string | undefined {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[1]}-${m[2]}`;
  return parseUsDate(s);
}

export function parseScWinners(html: string): WinnerRecord[] {
  const $ = cheerio.load(html);
  const winners: WinnerRecord[] = [];
  $("tr").each((_, tr) => {
    const cell = (th: string) => $(tr).find(`td[data-th="${th}"]`).text().trim();
    const retailer = cell("Retailer Name");
    const game = cell("Game Name");
    const prize = num(cell("Prize Amount"));
    if (!retailer || !game || !Number.isFinite(prize) || prize <= 0) return;
    winners.push({
      game,
      prize,
      retailer,
      city: cell("Retailer City") || undefined,
      address: cell("Retailer Address") || undefined,
      date: scDate(cell("Claim Date")),
      scratch: !DRAW_GAMES.has(game.toLowerCase()),
    });
  });
  // Newest first, so the CLI's cap keeps the most recent window.
  winners.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return winners;
}

export async function scrapeScWinners(): Promise<{ source: string; winners: WinnerRecord[] }> {
  const html = await fetchText(REPORT_URL, 120_000);
  const winners = parseScWinners(html);
  if (winners.length === 0)
    throw new Error("SC winners: 0 rows parsed — WinnersReport layout changed?");
  return { source: REPORT_URL, winners };
}
