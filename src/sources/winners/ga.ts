import * as cheerio from "cheerio";
import { fetchText, mapPool } from "../http.js";
import { num } from "../parse.js";
import { parseUsDate } from "./la.js";
import type { WinnerRecord } from "../../types.js";

/**
 * Georgia posted winners — roundup press releases ("players win huge across
 * the state") that list many winners each, with street-level retailer detail.
 *
 *   List:    https://www.galottery.com/en-us/media-center/press-releases.html
 *            (server-rendered div#press-release-list of links + dates)
 *   Article: /content/portal/en/media-center/pressreleaseinput/{yyyy}/{month}/
 *            {slug}.html (redirects to /en-us/…; fetch follows it). Winners
 *            appear one per paragraph/bullet:
 *            "A player in Fayetteville won a $1 million top prize playing the
 *            50X The Money scratcher. The ticket was purchased at Publix
 *            Super Market #1087, 840 Glynn St. The prize was claimed June 22."
 *            Jackpot-update articles split the pair across paragraphs:
 *            "… won a $3 million top prize playing the Georgia Lottery
 *            scratcher Grant. …" / "The ticket was purchased at Parker's #28,
 *            35 Old Sunbury Road in Hinesville." — and name draw games as
 *            "won $125,000 in the July 15 Fantasy 5 drawing".
 *
 * Winners are anonymous. Only wins naming the game AND the selling retailer
 * ("purchased at R, ADDR") are emitted; bullets that omit either are
 * skipped. Record ids are articlePath#index.
 */
const BASE = "https://www.galottery.com";
const LIST_URL = `${BASE}/en-us/media-center/press-releases.html`;

/** Cap of article fetches per run (backlog drains across runs). */
const MAX_ARTICLES_PER_RUN = 8;

/** GA draw games — flag scratch:false when the paragraph isn't explicit. */
const DRAW_GAMES = new Set([
  "fantasy 5",
  "mega millions",
  "powerball",
  "cash 3",
  "cash 4",
  "georgia five",
  "cash pop",
  "cash4life",
  "jumbo bucks lotto",
  "millionaire for life",
  "keno",
]);

/** Article paths from the press-release list page. */
export function parseGaList(html: string): string[] {
  const $ = cheerio.load(html);
  const paths: string[] = [];
  $("#press-release-list a").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    if (/\/pressreleaseinput\/\d{4}\/[a-z]+\/[^/]+\.html$/.test(href) && !paths.includes(href))
      paths.push(href);
  });
  return paths;
}

/** "$1 million" -> 1000000, "$539,327" -> 539327. */
const dollars = (amt: string, million: string | undefined): number =>
  num(amt) * (million ? 1_000_000 : 1);

/** All winners with game + retailer from one roundup article. */
export function parseGaArticle(html: string, path: string): WinnerRecord[] {
  // <br> separates bullets inside one <p>; make them real segment breaks.
  const $ = cheerio.load(html.replace(/<br[^>]*>/gi, "\n"));
  const fullText = $("body").text();
  // Dateline "ATLANTA (July 1, 2026)" pins the article date.
  const articleDate = parseUsDate(/\(([A-Za-z]+ \d{1,2}, \d{4})\)/.exec(fullText)?.[1]);

  const segments = $("p, li")
    .map((_, el) => $(el).text())
    .get()
    .flatMap((t) => t.split("\n"))
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 40);

  // "purchased at {RETAILER}, {ADDR}[ in {CITY}]."
  const saleOf = (seg: string) =>
    /purchased at ([^,]+?), (\d[^,]*?)(?:\s+in\s+([A-Z][A-Za-z .'-]+?))?\.(?:\s|$)/.exec(seg);
  const wonOf = (seg: string) =>
    /(?:won|winning|jackpot for)\s+(?:a|an|the)?\s*\$([\d,]+(?:\.\d+)?)(\s+million)?/i.exec(seg);
  const gameOf = (seg: string) =>
    /playing the Georgia Lottery scratcher ([^.,]+?)[.,]/.exec(seg)?.[1] ??
    /playing\s+(?:the\s+)?([^.,]+?)(?=\s+scratcher|\s+with|\s+through|[.,])/.exec(seg)?.[1] ??
    // Draw wins name the game via the drawing: "in the July 15 Fantasy 5 drawing".
    /in the [A-Za-z]+ \d{1,2},? ([A-Z][^.,]*?) drawing/.exec(seg)?.[1];

  // A one-word, digit-free "game" capture is almost always a mis-capture (a
  // person's name trailing "scratcher" in prose — observed: "scratcher Grant");
  // real GA game names are multi-word or carry digits ("50X The Money").
  // Skipping a rare legit one-word game is the acceptable cost of precision.
  const plausibleGame = (g: string) => /[\d$]/.test(g) || g.trim().includes(" ");

  const winners: WinnerRecord[] = [];
  const usedSales = new Set<number>();
  segments.forEach((seg, i) => {
    const won = wonOf(seg);
    const game = gameOf(seg);
    if (!won || !game || !plausibleGame(game)) return; // never guess a missing field
    const prize = dollars(won[1]!, won[2]);
    if (!Number.isFinite(prize) || prize <= 0) return;

    // Retailer: in the same paragraph, or a following "The ticket was
    // purchased at …" paragraph before the next win is mentioned.
    let sale = saleOf(seg);
    let saleSeg = seg;
    if (!sale) {
      for (let j = i + 1; j <= i + 3 && j < segments.length; j++) {
        if (usedSales.has(j) || wonOf(segments[j]!)) break; // next winner's turf
        const s = saleOf(segments[j]!);
        if (s) {
          sale = s;
          saleSeg = segments[j]!;
          usedSales.add(j);
          break;
        }
      }
    }
    if (!sale) return;
    const context = seg === saleSeg ? seg : `${seg} ${saleSeg}`;

    // City: after the address, or from "A player in X won" / "An X player".
    const city =
      sale[3] ??
      /(?:player|woman|man|resident|someone) in ([A-Z][A-Za-z .'-]+?) (?:won|hit|claimed)/i.exec(
        seg,
      )?.[1] ??
      /An? ([A-Z][A-Za-z .'-]+?) (?:player|woman|man|resident) (?:won|hit|claimed)/.exec(seg)?.[1];

    // "claimed June 22" has no year — borrow it from the article dateline.
    let date = articleDate;
    const claimed = /claimed (?:their (?:winnings|prize) )?(?:on )?([A-Za-z]+) (\d{1,2})(?!\d)/.exec(
      context,
    );
    if (claimed && articleDate) {
      const claim = parseUsDate(`${claimed[1]} ${claimed[2]}, ${articleDate.slice(0, 4)}`);
      // A December claim in a January article belongs to the prior year.
      if (claim) date = claim > articleDate ? parseUsDate(
        `${claimed[1]} ${claimed[2]}, ${Number(articleDate.slice(0, 4)) - 1}`,
      ) : claim;
    }

    winners.push({
      id: `${path}#${winners.length}`,
      game,
      prize,
      retailer: sale[1]!,
      city,
      address: sale[2]!.trim(),
      date,
      scratch: /scratcher|scratch-off/i.test(seg)
        ? true
        : DRAW_GAMES.has(game.toLowerCase())
          ? false
          : undefined,
    });
  });
  return winners;
}

export async function scrapeGaWinners(
  knownIds: ReadonlySet<string> = new Set(),
): Promise<{ source: string; winners: WinnerRecord[] }> {
  const known = [...knownIds];
  const paths = parseGaList(await fetchText(LIST_URL))
    .filter((p) => !known.some((id) => id.startsWith(`${p}#`)))
    .slice(0, MAX_ARTICLES_PER_RUN);

  const winners = (
    await mapPool(paths, 3, async (p): Promise<WinnerRecord[]> => {
      try {
        return parseGaArticle(await fetchText(BASE + p), p);
      } catch {
        return []; // one bad article never blocks the batch
      }
    })
  ).flat();

  return { source: LIST_URL, winners };
}
