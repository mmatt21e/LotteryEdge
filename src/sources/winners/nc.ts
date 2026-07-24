import * as cheerio from "cheerio";
import { fetchText, mapPool } from "../http.js";
import { num } from "../parse.js";
import type { WinnerRecord } from "../../types.js";

/**
 * North Carolina posted winners — individual press releases, one winner per
 * article, with street-level retailer detail in the prose.
 *
 *   List:   https://nclottery.com/news (server-rendered, 10 articles/page,
 *           ?p=2 …) — winner stories link to /News/{yyyy}/{m}/{d}/{slug}.
 *   Detail: server-rendered article in <main>, reliable sentence shape:
 *           "bought/purchased his {GAME} ticket from {RETAILER} on {STREET}
 *           in {CITY}" plus "won a $X prize" and a name like
 *           "Ray White of Statesville".
 *
 * Non-winner articles (jackpot updates, beneficiary news) parse to null, as
 * do digital/online instant wins, which have no selling retailer. The slug
 * is the record id; knownIds keeps already-captured articles from being
 * re-fetched, and a per-run cap bounds the rest.
 */
const BASE = "https://nclottery.com";
const LIST_URL = `${BASE}/news`;

/** List pages fetched per run (10 articles each). */
const LIST_PAGES = 3;
/** Cap of article fetches per run (backlog drains across runs). */
const MAX_DETAILS_PER_RUN = 20;

/** NC draw games — used to flag scratch:false when the prose isn't explicit. */
const DRAW_GAMES = new Set([
  "powerball",
  "mega millions",
  "lucky for life",
  "cash 5",
  "pick 3",
  "pick 4",
  "keno",
]);

/** Article paths like /News/2026/7/14/{slug} from a news list page. */
export function parseNcNewsList(html: string): string[] {
  const $ = cheerio.load(html);
  const paths: string[] = [];
  $('a[href^="/News/"]').each((_, a) => {
    const href = $(a).attr("href") ?? "";
    if (/^\/News\/\d{4}\/\d{1,2}\/\d{1,2}\/[^/]+$/.test(href) && !paths.includes(href))
      paths.push(href);
  });
  return paths;
}

/** Extract the single winner from an article page (null for non-winner news). */
export function parseNcArticle(html: string, path: string): WinnerRecord | null {
  const $ = cheerio.load(html);
  const text = ($("main").text() || $("body").text()).replace(/\s+/g, " ").trim();
  if (!text) return null;

  // "bought his lucky {GAME} ticket [on Monday] from {RETAILER} on {STREET}[,] in {CITY}"
  // Field captures exclude sentence enders so a match never spans sentences.
  const sale =
    /(?:bought|purchased)\s+(?:his|her|their|a|an|the)\s+(?:lucky\s+|winning\s+)?([^.!?"“”]+?)\s+ticket(?:\s+on\s+[A-Z][a-z]+day)?\s+(?:from|at)\s+([^.!?"“”]+?)\s+on\s+([^.!?"“”]+?),?\s+in\s+([A-Z][A-Za-z .'-]+?)(?=[.,"”])/.exec(
      text,
    );
  if (!sale) return null; // jackpot update, digital instant (no retailer), etc.
  let [, game, retailer, address, city] = sale as unknown as string[];

  // "bought his lucky ticket from …" leaves a filler word where the game
  // belongs — recover it from the "tried his luck on a $1 Cash 5 ticket"
  // sentence, or give up rather than guess.
  if (/^(?:lucky|winning|own|new|second)$/i.test(game!)) {
    game = /on a \$\d+ ([^.!?"“”]+?) (?:ticket|scratch-off)/.exec(text)?.[1];
    if (!game) return null;
  }
  // Prose "the" before a store name ("from the Circle K") isn't the brand.
  retailer = retailer!.replace(/^the\s+/, "");

  const won = /(?:won|wins|landed|pocketed|bagged)\s+(?:a|an|the)?\s*\$([\d,]+)(\s+million)?/.exec(
    text,
  );
  if (!won) return null;
  const prize = num(won[1]) * (won[2] ? 1_000_000 : 1);
  if (!Number.isFinite(prize) || prize <= 0) return null;

  // "Ray White of Statesville tried/bought/won…" — optional nicety. Two-word
  // names only: a wider match drags in page chrome ("Tweet Kevin Pavel").
  const player =
    /([A-Z][A-Za-z'.-]+ [A-Z][A-Za-z'.-]+) of [A-Z][A-Za-z .'-]+? (?:tried|won|bought|purchased|claimed|arrived|was|is|had|stopped|decided|took|landed|almost|said|says|played|plays)/.exec(
      text,
    )?.[1];

  const dm = /^\/News\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//.exec(path);
  const date = dm
    ? `${dm[1]}-${dm[2]!.padStart(2, "0")}-${dm[3]!.padStart(2, "0")}`
    : undefined;

  const scratch = DRAW_GAMES.has(game!.toLowerCase())
    ? false
    : /scratch-off|scratcher/i.test(text)
      ? true
      : undefined;

  return {
    id: path.split("/").pop()!,
    game: game!,
    prize,
    retailer: retailer!,
    city: city!,
    address: address!,
    player,
    date,
    scratch,
  };
}

export async function scrapeNcWinners(
  knownIds: ReadonlySet<string> = new Set(),
): Promise<{ source: string; winners: WinnerRecord[] }> {
  const pages = await mapPool(
    Array.from({ length: LIST_PAGES }, (_, i) => (i === 0 ? LIST_URL : `${LIST_URL}?p=${i + 1}`)),
    2,
    (url) => fetchText(url),
  );
  const paths = [...new Set(pages.flatMap(parseNcNewsList))]
    .filter((p) => !knownIds.has(p.split("/").pop()!))
    .slice(0, MAX_DETAILS_PER_RUN);

  const winners = (
    await mapPool(paths, 3, async (p): Promise<WinnerRecord | null> => {
      try {
        return parseNcArticle(await fetchText(BASE + p), p);
      } catch {
        return null; // one bad article never blocks the batch
      }
    })
  ).filter((w): w is WinnerRecord => w !== null);

  return { source: LIST_URL, winners };
}
