import * as cheerio from "cheerio";
import { fetchText, mapPool } from "./http.js";
import type { RawGame, PrizeTier } from "../types.js";

const BASE = "https://www.idaholottery.com";
const LIST_URL = `${BASE}/games/scratch?view=remaining_prizes`;
const DETAIL_URL = (slug: string) => `${BASE}/games/scratch/${slug}`;

/** Parse "$10,000" -> 10000, "2.00" -> 2, "N/A" -> NaN. */
function num(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[$,%\s]/g, "");
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

interface ListEntry {
  gameId: string;
  slug: string;
  name: string;
  price: number;
}

/** Parse the scratch list page for game cards (slug, id, name, price). */
export function parseIdList(html: string): ListEntry[] {
  const $ = cheerio.load(html);
  const entries: ListEntry[] = [];
  const seen = new Set<string>();

  $("li.game[data-game-id]").each((_, el) => {
    const $el = $(el);
    const gameId = ($el.attr("data-game-id") ?? "").trim();
    const href = $el.find("a.image-link[href*='/games/scratch/']").first().attr("href") ?? "";
    const slug = (/\/games\/scratch\/([a-z0-9-]+)/i.exec(href) ?? [])[1] ?? "";
    const name = $el.find(".game__title").first().text().trim();
    const price = num($el.find(".game__info-price").first().text());
    if (!gameId || !slug || !name || !Number.isFinite(price)) return;
    if (seen.has(gameId)) return; // cards can repeat (e.g. compare widget)
    seen.add(gameId);
    entries.push({ gameId, slug, name, price });
  });

  return entries;
}

/**
 * Parse a game detail page's "Rules & Odds" table:
 *   Number of Prizes | Prize Amount | Remaining Prizes | Odds ("1:238400")
 * Per-tier odds serve as the EV anchor.
 *
 * Idaho only publishes a "Remaining Prizes" count for the higher tiers; the low
 * tiers render the literal " *not available ". Treating those as remaining=0 (the
 * old behaviour) collapses the fraction-remaining estimate and detonates the EV.
 * Instead, estimate each unavailable tier's remaining from the depletion rate of
 * the tiers that DO publish a count (Σremaining / Σoriginal over known tiers),
 * which matches ev.ts's proportional-depletion model.
 */
export function parseIdDetail(html: string): PrizeTier[] {
  const $ = cheerio.load(html);

  interface Row {
    amount: number;
    odds: number | undefined;
    originalCount: number;
    remaining: number | undefined; // undefined = "not available"
  }
  const rows: Row[] = [];

  $("table.full-rules-and-odds tbody tr").each((_, tr) => {
    const $tr = $(tr);
    const originalCount = num($tr.find("td[data-title='Number of Prizes']").text());
    const amount = num($tr.find("td[data-tile='Prize Amount']").text());
    const remaining = num($tr.find("td[data-tile='Remaining Prizes']").text());
    const oddsText = $tr.find("td[data-tile='Odds']").text().trim();
    const oddsMatch = /1\s*[:in]+\s*([\d,.]+)/i.exec(oddsText);
    const odds = oddsMatch ? num(oddsMatch[1]) : NaN;

    if (!Number.isFinite(amount) || !Number.isFinite(originalCount)) return;
    rows.push({
      amount,
      odds: Number.isFinite(odds) ? odds : undefined,
      originalCount,
      // A finite value (including a real 0) is a published count; NaN means the
      // page said "not available" and we must estimate it below.
      remaining: Number.isFinite(remaining) ? remaining : undefined,
    });
  });

  // Depletion rate from tiers that publish a remaining count.
  let knownOriginal = 0;
  let knownRemaining = 0;
  for (const r of rows) {
    if (r.remaining !== undefined) {
      knownOriginal += r.originalCount;
      knownRemaining += r.remaining;
    }
  }
  // Fraction still unclaimed among known tiers; default to fully-remaining (1)
  // when nothing is published, which keeps EV conservative rather than inflated.
  const fracRemaining = knownOriginal > 0 ? knownRemaining / knownOriginal : 1;

  return rows.map((r) => ({
    amount: r.amount,
    odds: r.odds,
    originalCount: r.originalCount,
    remaining:
      r.remaining !== undefined
        ? r.remaining
        : Math.round(r.originalCount * fracRemaining),
  }));
}

/** Fetch and parse live Idaho scratch data (list -> per-game detail). */
export async function scrapeId(): Promise<{ source: string; games: RawGame[] }> {
  const listHtml = await fetchText(LIST_URL);
  const entries = parseIdList(listHtml);

  const games = (
    await mapPool(entries, 6, async (e): Promise<RawGame | null> => {
      const detailHtml = await fetchText(DETAIL_URL(e.slug));
      const tiers = parseIdDetail(detailHtml);
      if (tiers.length === 0) return null;
      return {
        state: "id",
        gameId: e.gameId,
        name: e.name,
        price: e.price,
        url: DETAIL_URL(e.slug),
        tiers,
      };
    })
  ).filter((g): g is RawGame => g !== null);

  if (games.length === 0) {
    throw new Error(
      "ID parser found 0 games — the Idaho scratch list/detail layout may have changed.",
    );
  }
  return { source: LIST_URL, games };
}
