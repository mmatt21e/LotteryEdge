import { fetchText } from "./http.js";
import type { RawGame, PrizeTier } from "../types.js";

const EXPLORER_URL = "https://www.walottery.com/Scratch/Explorer.aspx";

/** Parse "$2,000" / "2,714,800" -> number, "N/A" -> NaN. */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[$,\s]/g, "");
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

/** Parse "1 in 3.64" -> 3.64. */
function odds(s: string | undefined): number {
  const m = /1\s*in\s*([\d.,]+)/i.exec(s ?? "");
  return m ? num(m[1]) : NaN;
}

interface WaPrize {
  PrizeAmount?: string;
  TotalPrizesNumber?: number;
  PrizesRemainingNumber?: number;
}
interface WaGame {
  Id?: number;
  GameName?: string;
  Cost?: number;
  OverallOdds?: string;
  TicketsPrinted?: string;
  Prizes?: WaPrize[];
}

/**
 * Parse the Washington Scratch Explorer page.
 *
 * The page embeds the full dataset for every active game as a JSON blob:
 *   WaLottery.Scratch.data = { all: JSON.parse('{"Games":[ ... ]}') };
 * Each game carries Cost, OverallOdds ("1 in X"), TicketsPrinted, and a
 * Prizes[] array with per-tier PrizeAmount / TotalPrizesNumber (issued) /
 * PrizesRemainingNumber (remaining).
 */
export function parseWa(html: string): RawGame[] {
  const m = /WaLottery\.Scratch\.data\s*=\s*\{\s*all:\s*JSON\.parse\('([\s\S]+?)'\)/.exec(html);
  if (!m) return [];
  // The blob sits inside a single-quoted JS string; only apostrophes/backslashes
  // would be escaped. Undo those so the payload is valid JSON.
  const raw = m[1]!.replace(/\\'/g, "'").replace(/\\\\/g, "\\");

  let data: { Games?: WaGame[] };
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }

  const games: RawGame[] = [];
  for (const g of data.Games ?? []) {
    const gameId = g.Id != null ? String(g.Id) : "";
    const name = (g.GameName ?? "").trim();
    const price = Number(g.Cost);
    if (!gameId || !name || !Number.isFinite(price)) continue;

    const tiers: PrizeTier[] = [];
    for (const p of g.Prizes ?? []) {
      const amount = num(p.PrizeAmount);
      const originalCount = Number(p.TotalPrizesNumber);
      const remaining = Number(p.PrizesRemainingNumber);
      if (!Number.isFinite(amount) || !Number.isFinite(originalCount)) continue;
      tiers.push({
        amount,
        originalCount,
        remaining: Number.isFinite(remaining) ? remaining : 0,
      });
    }
    if (tiers.length === 0) continue;

    const overallOdds = odds(g.OverallOdds);
    const totalTickets = num(g.TicketsPrinted);

    games.push({
      state: "wa",
      gameId,
      name,
      price,
      url: `https://www.walottery.com/Scratch/Explorer.aspx?id=${gameId}`,
      tiers,
      overallOdds: Number.isFinite(overallOdds) ? overallOdds : undefined,
      totalTickets: Number.isFinite(totalTickets) ? totalTickets : undefined,
    });
  }

  return games;
}

/** Fetch and parse live WA scratch-off data. */
export async function scrapeWa(): Promise<{ source: string; games: RawGame[] }> {
  const html = await fetchText(EXPLORER_URL);
  const games = parseWa(html);
  if (games.length === 0) {
    throw new Error(
      "WA parser found 0 games — the embedded WaLottery.Scratch.data blob may have changed.",
    );
  }
  return { source: EXPLORER_URL, games };
}
