import * as cheerio from "cheerio";
import { fetchJson } from "../http.js";
import { num } from "../parse.js";
import type { WinnerRecord } from "../../types.js";

/**
 * Mississippi posted winners — WordPress REST press releases (category 1)
 * with winner prose mixed into general news; several winners per post.
 *
 *   https://www.mslottery.com/wp-json/wp/v2/posts?categories=1&per_page=30
 *     &_fields=id,date,slug,title,link,content
 *
 * Two reliable sentence shapes (winners are anonymous):
 *   A) 2nd-Chance roundups: "A Clinton player won $1,000,000 from a $20
 *      My Lottery Dream Home scratch-off game purchased from Fleet Way #143
 *      in Clinton."
 *   B) Single stories: "… a $1 million top prize on the $30 Millionaire
 *      Maker scratch-off game. The winning ticket was purchased … at
 *      Keith's Superstore #89 in Ocean Springs."
 *
 * Everything else (jackpot updates, draw-game prose without a clean game
 * name) is skipped. One request per run; ids are postId:matchIndex.
 */
const LIST_URL =
  "https://www.mslottery.com/wp-json/wp/v2/posts?categories=1&per_page=30&_fields=id,date,slug,title,link,content";

interface MsPost {
  id: number;
  date: string;
  slug: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
}

/** "$1,000,000" / "$1 million" -> dollars. */
const dollars = (amt: string, million: string | undefined): number =>
  num(amt) * (million ? 1_000_000 : 1);

/** All confidently-extracted winners across a batch of posts. */
export function parseMsPosts(posts: MsPost[]): WinnerRecord[] {
  const winners: WinnerRecord[] = [];
  for (const post of posts) {
    const text = cheerio.load(post.content?.rendered ?? "").text().replace(/\s+/g, " ");
    const date = post.date?.slice(0, 10) || undefined;
    let n = 0;
    const push = (amt: string, million: string | undefined, game: string, retailer: string, city: string) => {
      const prize = dollars(amt, million);
      if (!Number.isFinite(prize) || prize <= 0 || !game || !retailer) return;
      winners.push({
        id: `${post.id}:${n++}`,
        game: game.trim(),
        prize,
        retailer: retailer.trim(),
        city: city.trim(),
        date,
        scratch: true, // both patterns are explicitly scratch-off wins
      });
    };

    // A) "won $X from a $N {GAME} scratch-off game purchased from {RETAILER} in {CITY}."
    const reA =
      /won \$([\d,]+(?:\.\d+)?)(\s+million)? from a \$\d+ (.+?) scratch-off game purchased from (.+?) in ([A-Z][A-Za-z .'’&-]+?)\./g;
    for (let m; (m = reA.exec(text)); ) push(m[1]!, m[2], m[3]!, m[4]!, m[5]!);

    // B) "$X top prize on the $N {GAME} scratch-off game. The winning ticket
    //     was purchased [by …] at {RETAILER} in {CITY}."
    const reB =
      /\$([\d,]+(?:\.\d+)?)(\s+million)? top prize on the \$\d+ (.+?) scratch-off game\.\s*The winning ticket was purchased (?:by [^.]+? )?at (.+?) in ([A-Z][A-Za-z .'’&-]+?)\./g;
    for (let m; (m = reB.exec(text)); ) push(m[1]!, m[2], m[3]!, m[4]!, m[5]!);
  }
  return winners;
}

export async function scrapeMsWinners(): Promise<{ source: string; winners: WinnerRecord[] }> {
  const winners = parseMsPosts(await fetchJson<MsPost[]>(LIST_URL));
  return { source: LIST_URL, winners };
}
