import { fetchJson } from "./http.js";
import { fmtDollars } from "./parse.js";
import type { LiteGame } from "../types.js";

/**
 * Minnesota Lottery — Scratch games, LITE adapter (top prize only, NO EV).
 *
 * The public pages (https://www.mnlottery.com/games/unclaimed-prizes and the
 * scratch-game listings) render via the GameOn React widget
 * (widget.gameon.mnlottery.com), which pulls from the GameOn gateway. The
 * curl-reachable JSON feed backing the scratch-game list is:
 *
 *   GET https://gateway.gameon.mnlottery.com/services/game/api/published-games
 *       ?gameTypeId.in=1&excludeFeatured=false&page=0&size=<n>
 *
 * (gameTypeId 1 = "Instant" per the sibling /game/api/game-types endpoint.) No
 * auth header is required. Each record includes gameId, name, retailPrice,
 * topPrize / topPrizeHumanReadable, state, and playEnd.
 *
 * WHY LITE (no EV): published-games gives each game's single top prize and
 * headline odds, but not the full prize ladder with per-tier remaining counts,
 * so there is nothing to build a defensible expected value from. We expose
 * top-prize + closing-soon only, matching the Vermont adapter's rationale.
 *
 * CLOSING-SOON: MN sets `playEnd` (an announced game end date) on games it is
 * winding down; a null playEnd means open-ended. We flag closing-soon when
 * playEnd is present (the lottery has scheduled the game's end).
 */

const API_BASE = "https://gateway.gameon.mnlottery.com/services/game/api/published-games";
/** gameTypeId 1 = "Instant" (scratch) per /services/game/api/game-types. */
const INSTANT_GAME_TYPE_ID = 1;

interface MnPublishedGame {
  gameId: string;
  name: string;
  retailPrice: number;
  topPrize: number | null;
  topPrizeHumanReadable: string | null;
  state: string;
  playEnd: string | null;
}

interface MnPublishedGamesResponse {
  content: MnPublishedGame[];
  totalElements: number;
}

/** Convert one API game record into a LiteGame. */
export function toLiteGame(g: MnPublishedGame): LiteGame {
  const topPrizeValue =
    typeof g.topPrize === "number" && Number.isFinite(g.topPrize) ? g.topPrize : null;
  const topPrize =
    (g.topPrizeHumanReadable && g.topPrizeHumanReadable.trim()) ||
    (topPrizeValue !== null ? fmtDollars(topPrizeValue) : "");
  return {
    gameId: String(g.gameId),
    name: (g.name ?? "").trim(),
    price: Number(g.retailPrice),
    topPrize,
    topPrizeValue,
    // playEnd set => the lottery has scheduled this game to end soon.
    closingSoon: Boolean(g.playEnd),
  };
}

/** Fetch and parse live MN scratch-game data (LITE: top prize + closing-soon). */
export async function scrapeMn(): Promise<{ source: string; games: LiteGame[] }> {
  const url =
    `${API_BASE}?gameTypeId.in=${INSTANT_GAME_TYPE_ID}` +
    `&excludeFeatured=false&page=0&size=500`;

  const data = await fetchJson<MnPublishedGamesResponse>(url);

  const content = data.content ?? [];
  const games = content
    .filter((g) => g && g.gameId && g.name)
    .map(toLiteGame)
    .filter((g) => Number.isFinite(g.price));

  if (games.length === 0) {
    throw new Error(
      "MN parser found 0 games — the GameOn published-games feed shape may have changed.",
    );
  }
  return { source: API_BASE, games };
}
