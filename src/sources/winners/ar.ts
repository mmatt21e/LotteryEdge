import * as cheerio from "cheerio";
import { fetchText, mapPool } from "../http.js";
import { num } from "../parse.js";
import { parseUsDate } from "./la.js";
import type { WinnerRecord } from "../../types.js";

/**
 * Arkansas posted winners — Drupal press releases; "Winner Round-Up"
 * articles carry several winners each, others one or two.
 *
 *   Index:  https://www.myarkansaslottery.com/press-releases (?page=1 …)
 *   Detail: /press-release/{slug}, body in div.field-name-body, article
 *           date in .date-display-single.
 *
 * Prose shapes (winner names are partial — "R. Sorrells", "Darwin B."):
 *   won:  "won $200,000 playing Diamonds & Gold, a $10 scratch-off game"
 *   sale: "bought the winning ticket at Jordan's Kwik Stop #64, located at
 *          19888 Highway 18 E. in Monette." / "… playing the $100,000
 *          Platinum Crossword purchased at Doublebees #142, 7600 Cantrell
 *          Road in Little Rock."
 *   draw: "A winning Mega Millions ticket worth $30,000 was sold at
 *          Tobacco 4-Less #2, 2121 Batesville Blvd., in Batesville."
 *
 * A "won … playing {GAME}" is paired with the next retailer sentence before
 * the following win; wins that never get a retailer (photo captions,
 * second-chance/app prizes) are dropped. Record ids are slug#index.
 */
const BASE = "https://www.myarkansaslottery.com";
const INDEX_URL = `${BASE}/press-releases`;

/** Index pages fetched per run. */
const INDEX_PAGES = 2;
/** Cap of article fetches per run (backlog drains across runs). */
const MAX_ARTICLES_PER_RUN = 10;

/** AR draw games — flag scratch:false when the prose isn't explicit. */
const DRAW_GAMES = new Set([
  "powerball",
  "mega millions",
  "lotto",
  "natural state jackpot",
  "cash 3",
  "cash 4",
  "lucky for life",
]);

/** /press-release/{slug} paths from an index page. */
export function parseArIndex(html: string): string[] {
  const $ = cheerio.load(html);
  const paths: string[] = [];
  $('a[href^="/press-release/"]').each((_, a) => {
    const href = ($(a).attr("href") ?? "").split("?")[0]!;
    if (/^\/press-release\/[^/]+$/.test(href) && !paths.includes(href)) paths.push(href);
  });
  return paths;
}

const slugOf = (path: string): string => decodeURIComponent(path.split("/").pop()!);

/** All confidently-extracted winners from one press-release page. */
export function parseArArticle(html: string, path: string): WinnerRecord[] {
  const $ = cheerio.load(html);
  const body = $("div.field-name-body").text().replace(/\s+/g, " ").trim();
  if (!body) return [];
  const slug = slugOf(path);
  const date = parseUsDate($(".date-display-single").first().text());
  const winners: WinnerRecord[] = [];
  const seen = new Set<string>();
  const push = (w: Omit<WinnerRecord, "id">) => {
    const key = `${w.game}|${w.prize}|${w.retailer}`.toLowerCase();
    if (seen.has(key)) return; // photo captions repeat the win sentence
    seen.add(key);
    winners.push({ id: `${slug}#${winners.length}`, ...w });
  };

  // Scratch-off stories: "won $X [top prize] playing {GAME}" …
  const wins: { pos: number; end: number; prize: number; game: string; player?: string }[] = [];
  // Game names may hold dollar amounts ("$100,000 Platinum Crossword"), so a
  // comma only ends the game when it isn't inside a number.
  const reWon =
    /won (?:a |an |the )?\$([\d,]+(?:\.\d+)?)(\s+million)?(?: top prize| prize| jackpot)? playing (?:the )?((?:[^.,!]|,(?=\d))+?)(?=,(?!\d)| purchased| with| at | on [A-Z][a-z]+ \d|[.!])/gi;
  for (let m; (m = reWon.exec(body)); ) {
    const prize = num(m[1]) * (m[2] ? 1_000_000 : 1);
    if (!Number.isFinite(prize) || prize <= 0) continue;
    // "R. Sorrells of Craighead County won …" — partial name, optional.
    const player = /([A-Z][\w.'-]*(?: [A-Z][\w.'-]+)*) (?:of|from) [A-Z][A-Za-z ]+ County $/.exec(
      body.slice(Math.max(0, m.index - 60), m.index),
    )?.[1];
    wins.push({ pos: m.index, end: reWon.lastIndex, prize, game: m[3]!.trim(), player });
  }

  // … paired with the next "bought/purchased … at {RETAILER}, {ADDR} in {CITY}".
  const sales: { pos: number; retailer: string; address: string; city: string }[] = [];
  const reSale =
    /(?:(?:bought|purchased) the (?:winning )?tickets? at|purchased at) ([^,.]+?), (?:located at )?(\d[^,]*?),? in ([A-Z][A-Za-z .'-]+?)[.,]/g;
  for (let m; (m = reSale.exec(body)); )
    sales.push({ pos: m.index, retailer: m[1]!, address: m[2]!.trim(), city: m[3]! });

  wins.forEach((w, i) => {
    const limit = wins[i + 1]?.pos ?? body.length;
    const sale = sales.find((s) => s.pos >= w.pos && s.pos < limit);
    if (!sale) return; // caption or app/second-chance win — no retailer
    const near = body.slice(w.pos, Math.min(body.length, w.end + 80));
    push({
      game: w.game,
      prize: w.prize,
      retailer: sale.retailer,
      city: sale.city,
      address: sale.address,
      player: w.player,
      date,
      scratch: /scratch|instant/i.test(near)
        ? true
        : DRAW_GAMES.has(w.game.toLowerCase())
          ? false
          : undefined,
    });
  });

  // Draw-game sales: "A winning {GAME} ticket worth $X was sold at {R}, {ADDR}, in {CITY}."
  const reDraw =
    /winning ([A-Z][\w .'’&®-]*?)®? ticket,? (?:also )?worth \$([\d,]+(?:\.\d+)?)(\s+million)?,? was (?:sold|purchased) at ([^,.]+?), (\d[^,]*?),? in ([A-Z][A-Za-z .'-]+?)\./g;
  for (let m; (m = reDraw.exec(body)); ) {
    const prize = num(m[2]) * (m[3] ? 1_000_000 : 1);
    const game = m[1]!.replace(/®/g, "").trim();
    if (!Number.isFinite(prize) || prize <= 0 || !game) continue;
    push({
      game,
      prize,
      retailer: m[4]!,
      city: m[6]!,
      address: m[5]!.trim(),
      date,
      scratch: DRAW_GAMES.has(game.toLowerCase()) ? false : undefined,
    });
  }

  return winners;
}

export async function scrapeArWinners(
  knownIds: ReadonlySet<string> = new Set(),
): Promise<{ source: string; winners: WinnerRecord[] }> {
  const pages = await mapPool(
    Array.from({ length: INDEX_PAGES }, (_, i) => (i === 0 ? INDEX_URL : `${INDEX_URL}?page=${i}`)),
    2,
    (url) => fetchText(url),
  );
  const known = [...knownIds];
  const paths = [...new Set(pages.flatMap(parseArIndex))]
    .filter((p) => !known.some((id) => id.startsWith(`${slugOf(p)}#`)))
    .slice(0, MAX_ARTICLES_PER_RUN);

  const winners = (
    await mapPool(paths, 3, async (p): Promise<WinnerRecord[]> => {
      try {
        return parseArArticle(await fetchText(BASE + p), p);
      } catch {
        return []; // one bad article never blocks the batch
      }
    })
  ).flat();

  return { source: INDEX_URL, winners };
}
