import { fetchText } from "./http.js";
import type { RawGame, PrizeTier } from "../types.js";

const ORIGIN = "https://wvlottery.com";
/** Scratch-off list page (Next.js). Games + slugs live in the RSC flight data. */
const LIST_URL = `${ORIGIN}/games/scratch-offs`;

/**
 * The WV site is a Next.js app whose scratch-off data ships as server-rendered
 * React flight payloads embedded in the page HTML as a JS string. Inside that
 * string every JSON quote is backslash-escaped, e.g. `\"gameNumber\":\"1259\"`.
 * We match against that escaped form directly (matching a literal backslash then
 * a quote) rather than trying to unescape the whole — partial unescaping of a
 * flight chunk is fragile, but the fields we need are unambiguous.
 *
 * The list page carries only game metadata (slug, name, price, overall odds);
 * the FULL per-tier prize table (with prizes remaining) and the total-ticket /
 * overall-odds EV anchor live on each game's detail page, so we fetch those.
 */

/** Unescape a captured JSON-string body, e.g. "GEMS & BLOCKS" -> "GEMS & BLOCKS". */
function unescapeJsonString(s: string): string {
  try {
    return JSON.parse(`"${s}"`);
  } catch {
    return s;
  }
}

/** Overall odds are published as "4.58" or "1 in 4.58"; return the X of "1 in X". */
export function parseOverallOdds(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const m = /([\d.]+)/.exec(raw.replace(/^\s*1\s*in\s*/i, ""));
  const v = m ? Number(m[1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

/** Every scratch-off game slug embedded in the list page (they start with the game number). */
export function parseWvSlugs(listHtml: string): string[] {
  const slugs = new Set<string>();
  const re = /\\"slug\\":\\"(\d[A-Za-z0-9-]*)\\"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(listHtml)) !== null) slugs.add(m[1]!);
  return [...slugs];
}

/**
 * Parse a single game's detail page into a RawGame.
 *
 * The detail page embeds exactly one game object, so each scalar field
 * (`gameNumber`, `ticketPrice`, `odds`, `totalTickets`) appears once. The prize
 * table is a `prizeDetails` array of `{prize, totalPrizes, remainingPrizes}`.
 * We anchor EV on the overall odds (the embedded `totalTickets` is occasionally
 * stale/garbage — some games report it far below their winning-ticket count).
 */
export function parseWvGame(slug: string, html: string): RawGame | null {
  const marker = '\\"prizeDetails\\":[';
  const start = html.indexOf(marker);
  if (start < 0) return null;
  // The array ends at the first "]" — prize tier objects contain no nested arrays.
  const seg = html.slice(start, start + html.slice(start).indexOf("]") + 1);

  const tiers: PrizeTier[] = [];
  const tierRe = /\\"prize\\":(\d+),\\"totalPrizes\\":(\d+),\\"remainingPrizes\\":(\d+)/g;
  let t: RegExpExecArray | null;
  while ((t = tierRe.exec(seg)) !== null) {
    tiers.push({
      amount: Number(t[1]),
      originalCount: Number(t[2]),
      remaining: Number(t[3]),
    });
  }
  if (tiers.length === 0) return null;

  const priceM = /\\"ticketPrice\\":(\d+)/.exec(html);
  const price = priceM ? Number(priceM[1]) : NaN;
  if (!Number.isFinite(price) || price <= 0) return null;

  const gnM = /\\"gameNumber\\":\\"([^"\\]+)\\"/.exec(html);
  const gameId = gnM ? gnM[1]! : slug;

  const oddsM = /\\"odds\\":\\"([^"\\]+)\\"/.exec(html);
  const overallOdds = parseOverallOdds(oddsM?.[1]);

  // Game title sits immediately before its duplicate in `imageAltText`, which
  // uniquely distinguishes it from unrelated `title` fields (nav menus, etc.).
  const titleM = /\\"title\\":\\"((?:[^"\\]|\\.)*?)\\",\\"imageAltText\\"/.exec(html);
  const name = titleM ? unescapeJsonString(titleM[1]!) : slug;

  return {
    state: "wv",
    gameId,
    name,
    price,
    url: `${ORIGIN}/games/scratch-offs/${slug}`,
    tiers,
    overallOdds,
  };
}

/** Fetch and parse live West Virginia scratch-off data. */
export async function scrapeWv(): Promise<{ source: string; games: RawGame[] }> {
  const listHtml = await fetchText(LIST_URL);
  const slugs = parseWvSlugs(listHtml);
  if (slugs.length === 0) {
    throw new Error(
      "WV parser found 0 game slugs — the list page flight data may have changed. Inspect the markup.",
    );
  }

  const games: RawGame[] = [];
  const BATCH = 8;
  for (let i = 0; i < slugs.length; i += BATCH) {
    const slice = slugs.slice(i, i + BATCH);
    const batch = await Promise.all(
      slice.map(async (slug): Promise<RawGame | null> => {
        try {
          const html = await fetchText(`${ORIGIN}/games/scratch-offs/${slug}`);
          return parseWvGame(slug, html);
        } catch {
          return null; // drop games whose detail page fails to load/parse
        }
      }),
    );
    for (const g of batch) if (g) games.push(g);
  }

  if (games.length === 0) {
    throw new Error(
      "WV parser found 0 games with prize tiers — the detail page layout may have changed.",
    );
  }

  return { source: LIST_URL, games };
}
