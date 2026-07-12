import type { LiteGame } from "../types.js";

/**
 * Oregon Lottery — Scratch-its, LITE adapter (top prize only, NO EV).
 *
 * The public page https://www.oregonlottery.org/scratch-its/list/ is JS-rendered:
 * a DataTables grid populated client-side by the theme block
 * `ol-table-scratchit.js`, which calls `new ScratchGames().GetList()`. That class
 * (in the pollinate-ol-api plugin's main.min.js) fetches Oregon's MuleSoft API:
 *
 *   GET https://api.oregonlottery.org/gameinfo/v1/instant/games
 *       ?offset=<n>&count=<n>&includePrizeTiers=false
 *
 * The API requires `client_id` / `client_secret` headers. The site ships those
 * credentials in the page as `olapi.newClient` / `olapi.newSecret`, lightly
 * obfuscated with a reverse-Caesar-plus-chunk-reverse scheme ("unscramble", in
 * the plugin's helpers.js). We reproduce that unscramble here and use the same
 * published credentials, so the whole adapter is curl/fetch-reachable with no
 * headless browser.
 *
 * WHY LITE (no EV): this endpoint (with includePrizeTiers=false) publishes only
 * each game's single TOP prize amount and the count of top prizes remaining —
 * not the full prize ladder or per-tier original counts. There is nothing to
 * build a defensible expected value from, so we expose top-prize + closing-soon
 * only, matching the Vermont adapter's rationale.
 *
 * The response also carries `SellThroughRate` (percent sold) and `GameEndDate`,
 * which we use for the active-game filter and the closing-soon flag.
 */

const API_BASE = "https://api.oregonlottery.org/gameinfo/v1/instant/games";

/**
 * Credentials the site embeds in-page as `olapi.newClient` / `olapi.newSecret`.
 * They are public (served to every browser) and obfuscated with `unscramble`.
 */
const SCRAMBLED_CLIENT = "27i2d9i356h5dhd74i87898he1e3d007";
const SCRAMBLED_SECRET = "7h92G9g5784de2604H2017Hh94f309G1";

/** A game is "closing soon" when it is >=85% sold or its top prizes are all gone. */
const CLOSING_SOON_SOLD_PCT = 85;

interface OlInstantGame {
  GameNumber: string;
  TicketPrice: number;
  TopPrize: number;
  GameNameTitle: string;
  SellThroughRate: number;
  TopPrizesRemaining: number;
  DateAvailable?: string;
  GameEndDate?: string;
}

interface OlListResponse {
  NextPageUrl: string | null;
  InstantGames: OlInstantGame[];
}

/**
 * Reverse the site's "unscramble": reverse-Caesar (shift 3) each letter, split
 * into `chunkSize`-char chunks, reverse the chunk order, rejoin. Verbatim port
 * of pollinate-ol-api/js/helpers.js so we can rebuild the API credentials.
 */
export function unscramble(encoded: string, chunkSize = 4, shift = 3): string {
  shift = shift % 26;
  let decoded = "";
  for (let i = 0; i < encoded.length; i++) {
    const ch = encoded[i] as string;
    const code = encoded.charCodeAt(i);
    if (ch >= "a" && ch <= "z") {
      decoded += String.fromCharCode(((code - 97 - shift + 26) % 26) + 97);
    } else if (ch >= "A" && ch <= "Z") {
      decoded += String.fromCharCode(((code - 65 - shift + 26) % 26) + 65);
    } else {
      decoded += ch;
    }
  }
  const chunks: string[] = [];
  for (let i = 0; i < decoded.length; i += chunkSize) {
    chunks.push(decoded.slice(i, i + chunkSize));
  }
  chunks.reverse();
  return chunks.join("");
}

/** Format a dollar amount as "$1,000,000". */
function fmtDollars(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

/** True if the game is currently for sale (started, not yet ended). */
function isActive(g: OlInstantGame, now: number): boolean {
  if (!g.GameNameTitle) return false;
  const start = g.DateAvailable ? Date.parse(g.DateAvailable) : NaN;
  if (!Number.isFinite(start) || start > now) return false;
  if (g.GameEndDate) {
    const end = Date.parse(g.GameEndDate);
    if (Number.isFinite(end) && end <= now) return false;
  }
  return true;
}

/** Convert one API game record into a LiteGame. */
function toLiteGame(g: OlInstantGame): LiteGame {
  const topPrizeValue = Number.isFinite(g.TopPrize) ? g.TopPrize : null;
  const topPrize = topPrizeValue !== null ? fmtDollars(topPrizeValue) : "";
  const sold = Number(g.SellThroughRate);
  const topGone = Number(g.TopPrizesRemaining) === 0;
  const closingSoon =
    (Number.isFinite(sold) && sold >= CLOSING_SOON_SOLD_PCT) || topGone;
  return {
    gameId: String(g.GameNumber),
    name: g.GameNameTitle.trim(),
    price: Number(g.TicketPrice),
    topPrize,
    topPrizeValue,
    closingSoon,
  };
}

/** Fetch every page of the instant-games list, following NextPageUrl. */
async function fetchAllGames(): Promise<OlInstantGame[]> {
  const clientId = unscramble(SCRAMBLED_CLIENT);
  const clientSecret = unscramble(SCRAMBLED_SECRET);
  const headers = {
    client_id: clientId,
    client_secret: clientSecret,
    Accept: "application/json",
    "User-Agent": "LotteryEdge/0.1 (personal scratch-off EV tool)",
  };

  const all: OlInstantGame[] = [];
  let offset = 0;
  const count = 100;
  // Bounded loop: the full catalog is a few hundred games.
  for (let page = 0; page < 50; page++) {
    const url = `${API_BASE}?offset=${offset}&count=${count}&includePrizeTiers=false`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    let data: OlListResponse;
    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
      data = (await res.json()) as OlListResponse;
    } finally {
      clearTimeout(timer);
    }
    const games = data.InstantGames ?? [];
    all.push(...games);
    if (!data.NextPageUrl || games.length === 0) break;
    offset += games.length;
  }
  return all;
}

/** Fetch and parse live OR scratch-it data (LITE: top prize + closing-soon). */
export async function scrapeOr(): Promise<{ source: string; games: LiteGame[] }> {
  const now = Date.now();
  const raw = await fetchAllGames();
  const games = raw.filter((g) => isActive(g, now)).map(toLiteGame);
  if (games.length === 0) {
    throw new Error(
      "OR parser found 0 active games — the instant-games API shape or credentials may have changed.",
    );
  }
  return { source: API_BASE, games };
}
