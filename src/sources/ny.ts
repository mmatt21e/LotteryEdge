import { fetchText } from "./http.js";
import type { LiteGame } from "../types.js";

/**
 * New York Lottery — instant games, LITE adapter (top prize only, NO EV).
 *
 * Source: NY Open Data "Lottery Instant Games Prizes" dataset (Socrata JSON,
 * public, no auth):
 *   https://data.ny.gov/resource/nzqa-7unk.json
 *
 * Each row is one prize TIER of one game:
 *   game_number, game_name, prize_amount ("$50"), paid, unpaid, total
 * We group rows by game_number and take the largest prize_amount as the
 * headline top prize.
 *
 * WHY LITE (no EV): this dataset publishes prize AMOUNTS and paid/unpaid COUNTS
 * but NO ticket price and NO original print run per tier in a usable form, and —
 * critically — it does not tell us how many tickets remain unsold. Expected
 * value per remaining ticket is therefore not computable from it. We expose the
 * game list + top prize only.
 *
 * NOTE: the dataset has NO ticket price, so `price` is set to 0 for every game.
 */

const DATA_URL = "https://data.ny.gov/resource/nzqa-7unk.json";
// The dataset is ~1,230 rows across ~112 games; Socrata defaults to 1,000, so
// request explicitly above the row count.
const FETCH_URL = `${DATA_URL}?$limit=50000`;

interface NyRow {
  game_number?: string;
  game_name?: string;
  prize_amount?: string;
}

/** Parse "$10,000,000" / "$50" -> number, blanks/garbage -> NaN. */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[$,\s]/g, "");
  if (cleaned === "") return NaN;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

export function parseNy(json: string): LiteGame[] {
  const rows = JSON.parse(json) as NyRow[];
  if (!Array.isArray(rows)) {
    throw new Error("NY dataset did not parse to an array — schema may have changed.");
  }

  // Group tiers by game_number, tracking the highest prize amount and its label.
  const byGame = new Map<
    string,
    { name: string; topPrizeValue: number; topPrizeText: string }
  >();

  for (const row of rows) {
    const gameId = (row.game_number ?? "").trim();
    const name = (row.game_name ?? "").trim();
    const amount = num(row.prize_amount);
    if (!gameId || !name || !Number.isFinite(amount)) continue;

    const existing = byGame.get(gameId);
    if (!existing) {
      byGame.set(gameId, {
        name,
        topPrizeValue: amount,
        topPrizeText: (row.prize_amount ?? "").trim(),
      });
    } else if (amount > existing.topPrizeValue) {
      existing.topPrizeValue = amount;
      existing.topPrizeText = (row.prize_amount ?? "").trim();
    }
  }

  const games: LiteGame[] = [];
  for (const [gameId, g] of byGame) {
    games.push({
      gameId,
      name: g.name,
      // Dataset carries no ticket price — see module note.
      price: 0,
      topPrize: g.topPrizeText || "$" + g.topPrizeValue.toLocaleString("en-US"),
      topPrizeValue: g.topPrizeValue,
      // Dataset carries no sell-through / end-date signal.
      closingSoon: false,
    });
  }
  return games;
}

/** Fetch and parse live NY instant-game data (LITE: top prize only, price=0). */
export async function scrapeNy(): Promise<{ source: string; games: LiteGame[] }> {
  const json = await fetchText(FETCH_URL);
  const games = parseNy(json);
  if (games.length === 0) {
    throw new Error(
      "NY parser found 0 games — the Open Data dataset may have moved or changed schema.",
    );
  }
  return { source: DATA_URL, games };
}
