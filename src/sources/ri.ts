import { randomUUID } from "node:crypto";
import { fetchJson, fetchText } from "./http.js";
import type { RawGame, PrizeTier } from "../types.js";

/**
 * The Rhode Island instant-games page (Adobe AEM) renders its game grid on the
 * client from a JSON API — the "convenience cloud" service at
 * `<convenienceCloudApi>/api/v1/instant-games/games/`. That endpoint returns
 * every game with its FULL prize-tier breakdown (winning vs paid tickets), the
 * total print run and overall odds, so it is a complete EV source in one call
 * (paginated). It requires the `x-esa-api-key` header; both the key and the API
 * base are published in the page's inline config, which we read at runtime so a
 * rotated key doesn't silently break the adapter.
 */

const PAGE_URL = "https://www.rilot.com/en-us/instantgames.html";

interface RiPrizeTier {
  prizeAmount: number; // in cents
  winningTickets: number; // total prizes printed at this tier
  paidTickets: number; // prizes claimed
}
interface RiGame {
  gameId: string;
  gameName: string;
  validationStatus: string; // ACTIVE | DISABLED | NOT_ACTIVE
  ticketPrice: number; // in cents
  totalTicket?: number;
  overallOdds?: string;
  prizeTiers?: RiPrizeTier[];
}
interface RiPage {
  games?: RiGame[];
  nextPageUrl?: string | null;
  nextItems?: number;
}

/** Read the ESA API key and convenience-cloud base URL from the page's inline config. */
export function parseRiConfig(pageHtml: string): { apiKey: string; apiBase: string } {
  const keyM = /ESA_API_KEY\s*=\s*'([^']+)'/.exec(pageHtml);
  const baseM = /convenienceCloudApi\s*=\s*'([^']+)'/.exec(pageHtml);
  if (!keyM || !baseM) {
    throw new Error(
      "RI: could not find ESA_API_KEY / convenienceCloudApi in the page config — the site config may have changed.",
    );
  }
  return { apiKey: keyM[1]!, apiBase: baseM[1]!.replace(/\/$/, "") };
}

async function fetchGamesJson(url: string, apiKey: string): Promise<RiPage> {
  return fetchJson<RiPage>(url, {
    headers: {
      "X-User-Agent": "portal",
      "x-esa-api-key": apiKey,
      "x-request-id": randomUUID(),
    },
  });
}

/** Convert one API game into a RawGame, or null if it has no usable prize data. */
export function riGameToRaw(g: RiGame): RawGame | null {
  const rawTiers = g.prizeTiers ?? [];
  const tiers: PrizeTier[] = [];
  for (const t of rawTiers) {
    const amount = t.prizeAmount / 100; // cents -> dollars
    const originalCount = t.winningTickets;
    if (!Number.isFinite(amount) || !Number.isFinite(originalCount) || originalCount <= 0) continue;
    tiers.push({
      amount,
      originalCount,
      remaining: Math.max(originalCount - t.paidTickets, 0),
    });
  }
  if (tiers.length === 0) return null;

  const price = g.ticketPrice / 100; // cents -> dollars
  if (!Number.isFinite(price) || price <= 0) return null;

  const overall = g.overallOdds ? Number(g.overallOdds) : NaN;
  const winningTotal = tiers.reduce((s, t) => s + t.originalCount, 0);
  // Only trust the stated print run when it's at least the winning-ticket count.
  const totalTickets =
    g.totalTicket && g.totalTicket >= winningTotal ? g.totalTicket : undefined;

  return {
    state: "ri",
    gameId: String(g.gameId),
    name: g.gameName?.trim() || String(g.gameId),
    price,
    url: PAGE_URL,
    tiers,
    overallOdds: Number.isFinite(overall) && overall > 0 ? overall : undefined,
    totalTickets,
  };
}

/** Fetch and parse live Rhode Island scratch-off ("instant games") data. */
export async function scrapeRi(): Promise<{ source: string; games: RawGame[] }> {
  const pageHtml = await fetchText(PAGE_URL);
  const { apiKey, apiBase } = parseRiConfig(pageHtml);

  const listBase = `${apiBase}/api/v1/instant-games/games/`;
  const all: RiGame[] = [];
  let next: string | null = listBase;
  // Paginate defensively (the feed is ~200 games in pages of 10).
  for (let guard = 0; next && guard < 100; guard++) {
    const page: RiPage = await fetchGamesJson(next, apiKey);
    if (page.games) all.push(...page.games);
    next = page.nextPageUrl && (page.nextItems ?? 0) > 0 ? apiBase + page.nextPageUrl : null;
  }

  if (all.length === 0) {
    throw new Error("RI API returned 0 games — the endpoint or its shape may have changed.");
  }

  // Only currently-active games are for sale; ended/disabled games have skewed
  // remaining counts that produce meaningless EV.
  const games: RawGame[] = [];
  for (const g of all) {
    if (g.validationStatus !== "ACTIVE") continue;
    const raw = riGameToRaw(g);
    if (raw) games.push(raw);
  }

  if (games.length === 0) {
    throw new Error("RI parser produced 0 active games with prize tiers — shape may have changed.");
  }

  return { source: listBase, games };
}
