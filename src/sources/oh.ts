import type { RawGame, PrizeTier } from "../types.js";

/**
 * Ohio Lottery "Prizes Remaining" (https://www.ohiolottery.com/games/scratch-offs/prizes-remaining)
 * is a Vue app whose <prizes-remaining> component (bundle /dist/js/app.js) pulls
 * data from the ohiolottery "solutions" JSON API. Every call needs a Bearer
 * token, which the site mints via an anonymous public login baked into the
 * bundle — so the whole flow is reachable with plain fetch, no browser.
 *
 * Flow:
 *   1. POST anonymous creds -> auth API -> JWT.
 *   2. GET GetFullPrizesRemainingList  (per-tier value/total/remaining, no odds).
 *   3. GET GetAllGames                 (overall "1 in X" odds -> EV anchor),
 *      joined to the prize list by game number.
 */
const AUTH_URL = "https://authapi-solutions.ohiolottery.com/1.0/Authentication/Login";
const PRIZES_URL =
  "https://api-solutions.ohiolottery.com/1.0/Games/ScratchOffs/ScratchOffGame/GetFullPrizesRemainingList";
const GAMES_URL =
  "https://api-solutions.ohiolottery.com/1.0/Games/ScratchOffs/ScratchOffGame/GetAllGames";
const PAGE_URL = "https://www.ohiolottery.com/games/scratch-offs/prizes-remaining";

// Anonymous public API account hardcoded in the site's own JS bundle. It grants
// read access to the same data the public page shows — no user data involved.
const PUBLIC_USER = "mobilepublic@mtllc.com";
const PUBLIC_PASS = "R7V5Sz8@";

const UA = "LotteryEdge/0.1 (personal scratch-off EV tool)";

interface OhPrizeRow {
  prizeValue: number;
  totalPrizes: number;
  prizesLeft: number;
}
interface OhPrizeGame {
  gameCode: string;
  gameName: string;
  ticketPrice: number;
  prizeRemainingValues: OhPrizeRow[];
}
interface OhListGame {
  gameNumber: string;
  oddsOfWinning: string; // e.g. "1 in 4.81"
}

/** Parse "1 in 4.81" -> 4.81 (NaN if absent). */
function parseOverallOdds(s: string | undefined): number {
  const m = /1\s*in\s*([\d.]+)/i.exec(s ?? "");
  return m ? Number(m[1]) : NaN;
}

async function getToken(): Promise<string> {
  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json-patch+json", "User-Agent": UA },
    body: JSON.stringify({ userName: PUBLIC_USER, password: PUBLIC_PASS }),
  });
  if (!res.ok) throw new Error(`OH auth -> ${res.status} ${res.statusText}`);
  const body = (await res.json()) as { data?: { token?: string } };
  const token = body.data?.token;
  if (!token) throw new Error("OH auth returned no token — login shape changed.");
  return token;
}

async function getJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  const body = (await res.json()) as { data?: T };
  if (body.data === undefined) throw new Error(`GET ${url} returned no data field.`);
  return body.data;
}

/**
 * Build games from the prize feed and the overall-odds lookup. GetAllGames
 * returns data keyed by price bucket ("1","2",...), each an array of games.
 */
export function buildOhGames(
  prizes: OhPrizeGame[],
  gamesData: Record<string, OhListGame[]> | OhListGame[],
): RawGame[] {
  const flat: OhListGame[] = Array.isArray(gamesData)
    ? gamesData
    : ([] as OhListGame[]).concat(...Object.values(gamesData));

  const oddsByNumber = new Map<string, number>();
  for (const g of flat) {
    const odds = parseOverallOdds(g.oddsOfWinning);
    if (Number.isFinite(odds) && odds > 0) oddsByNumber.set(String(g.gameNumber).trim(), odds);
  }

  const games: RawGame[] = [];
  for (const p of prizes) {
    const code = String(p.gameCode).trim();
    const overallOdds = oddsByNumber.get(code);
    // Without an odds anchor the print run is unknown and EV can't be estimated;
    // skip rather than publish a game with no basis.
    if (overallOdds === undefined) continue;

    const tiers: PrizeTier[] = [];
    for (const row of p.prizeRemainingValues) {
      const amount = Number(row.prizeValue);
      const originalCount = Number(row.totalPrizes);
      const remaining = Number(row.prizesLeft);
      if (!Number.isFinite(amount) || !Number.isFinite(originalCount)) continue;
      tiers.push({
        amount,
        originalCount,
        remaining: Number.isFinite(remaining) ? remaining : 0,
      });
    }
    if (tiers.length === 0) continue;

    games.push({
      state: "oh",
      gameId: code,
      name: (p.gameName ?? "").trim(),
      price: Number(p.ticketPrice),
      url: PAGE_URL,
      tiers,
      overallOdds,
    });
  }

  return games;
}

/** Fetch and parse live OH scratch-off data. */
export async function scrapeOh(): Promise<{ source: string; games: RawGame[] }> {
  const token = await getToken();
  const [prizes, gamesData] = await Promise.all([
    getJson<OhPrizeGame[]>(PRIZES_URL, token),
    getJson<Record<string, OhListGame[]>>(GAMES_URL, token),
  ]);
  const games = buildOhGames(prizes, gamesData);
  if (games.length === 0) {
    throw new Error(
      "OH parser found 0 games — the API shape may have changed. Inspect GetFullPrizesRemainingList.",
    );
  }
  return { source: PRIZES_URL, games };
}
