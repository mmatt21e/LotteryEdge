import * as cheerio from "cheerio";
import { fetchText } from "./http.js";
import type { RawGame, PrizeTier } from "../types.js";

const PRIZES_URL = "https://vtlottery.com/games/instant-tickets/outstanding-prizes";

/** Parse "$50,000" / "294,000" / "17" -> number, blanks -> NaN. */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[$,%\s]/g, "");
  if (cleaned === "") return NaN;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

/** Split a `<br>`-delimited cell (given its inner HTML) into trimmed lines. */
function lines(html: string | null): string[] {
  // Replace <br> with newlines so multi-value cells split cleanly.
  return (html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

/**
 * Parse the Vermont "Outstanding Prizes" table.
 *
 * One row per active instant game (columns):
 *   Price | Game # | Game Name (link) | Top Prizes (<br> list) |
 *   Unclaimed Top Prizes (<br> list) | Total Unclaimed | % Sold | # Of Tickets
 *
 * Prize tiers pair the "Top Prizes" amounts with the parallel "Unclaimed"
 * counts. VT does not publish per-tier original counts, so we estimate each
 * tier's originalCount from the game's stated "% Sold": at s% sold the pool is
 * (1 - s) unsold, so original ≈ remaining / (1 - s). "# Of Tickets" (tickets
 * printed) becomes the game's totalTickets anchor.
 */
export function parseVt(html: string): RawGame[] {
  const $ = cheerio.load(html);
  const games: RawGame[] = [];

  $("table tbody tr").each((_, tr) => {
    const tds = $(tr).find("td").toArray();
    if (tds.length < 8) return;

    const price = num($(tds[0]).text());
    const gameId = $(tds[1]).text().trim();
    const $a = $(tds[2]).find("a").first();
    const name = ($a.text() || $(tds[2]).text()).trim();
    const href = $a.attr("href") ?? "";

    const amounts = lines($(tds[3]).html()).map(num);
    const remaining = lines($(tds[4]).html()).map(num);
    const soldPct = num($(tds[6]).text());
    const totalTickets = num($(tds[7]).text());

    if (!Number.isFinite(price) || !gameId || !name) return;

    // At s% sold, the fraction still unsold is (1 - s/100); use it to lift the
    // unclaimed counts back to an estimated original count per tier.
    const soldFrac = Number.isFinite(soldPct) ? soldPct / 100 : 0;
    const unsold = 1 - soldFrac;

    const tiers: PrizeTier[] = [];
    const n = Math.min(amounts.length, remaining.length);
    for (let i = 0; i < n; i++) {
      const amount = amounts[i]!;
      const rem = Number.isFinite(remaining[i]) ? remaining[i]! : 0;
      if (!Number.isFinite(amount)) continue;
      const originalCount = unsold > 0.01 ? Math.max(rem, Math.round(rem / unsold)) : rem;
      tiers.push({ amount, originalCount, remaining: rem });
    }
    if (tiers.length === 0) return;

    games.push({
      state: "vt",
      gameId,
      name,
      price,
      url: href ? new URL(href, PRIZES_URL).toString() : undefined,
      tiers,
      totalTickets: Number.isFinite(totalTickets) ? totalTickets : undefined,
    });
  });

  return games;
}

/** Fetch and parse live VT scratch-off data. */
export async function scrapeVt(): Promise<{ source: string; games: RawGame[] }> {
  const html = await fetchText(PRIZES_URL);
  const games = parseVt(html);
  if (games.length === 0) {
    throw new Error(
      "VT parser found 0 games — the Outstanding Prizes table layout may have changed.",
    );
  }
  return { source: PRIZES_URL, games };
}
