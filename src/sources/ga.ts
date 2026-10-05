import { fetchText } from "./http.js";
import type { LiteGame } from "../types.js";
export const GA_SOURCE = "https://www.galottery.com/en-us/games/scratchers/scratchers-top-prizes-claimed.html";
interface PublishedRow {
    gameId: string;
    gameName: string;
    ticketPrice: string;
    topPrize: string;
    claimed: string;
    total: string;
}
/** Official display-dollar table replaces the retired API's unreliable prizeAmount unit assumption.
 * Parse JSON only; never execute embedded JavaScript or guess a numeric scale. */
export function parseGa(html: string): {
    games: LiteGame[];
    sourceAsOf?: string;
} {
    const match = /topPrizListArray\s*:\s*JSON\.stringify\((\[[\s\S]*?\])\)/.exec(html);
    if (!match)
        throw new Error("GA published prize table unavailable; do not use the retired API");
    const rows: PublishedRow[] = JSON.parse(match[1]!);
    const dollars = (s: string): number | null => /^\$[\d,]+(?:\.\d{1,2})?$/.test(s.trim()) ? Number(s.replace(/[$,]/g, "")) : null;
    const byId = new Map<string, LiteGame>();
    for (const row of rows) {
        const price = dollars(row.ticketPrice), top = dollars(row.topPrize);
        if (!row.gameId || !row.gameName || !price || !Number.isFinite(price))
            throw new Error("GA invalid published identity/price");
        const game: LiteGame = { gameId: row.gameId, name: row.gameName.trim(), price, topPrize: row.topPrize, topPrizeValue: top, closingSoon: false, url: `https://www.galottery.com/en-us/games/scratchers/${row.gameId}.html` };
        const existing = byId.get(row.gameId);
        if (!existing || (top ?? -1) > (existing.topPrizeValue ?? -1))
            byId.set(row.gameId, game);
    }
    const date = /Data as of\s+(?:\w+,\s*)?(\w+)\s+(\d{1,2}),\s*(\d{4})/i.exec(html);
    const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"], month = date ? months.indexOf(date[1]!.toLowerCase()) + 1 : 0;
    const sourceAsOf = date && month ? `${date[3]}-${String(month).padStart(2, "0")}-${date[2]!.padStart(2, "0")}` : undefined;
    if (!byId.size)
        throw new Error("GA published table has no games");
    return { games: [...byId.values()], sourceAsOf };
}
export async function scrapeGa(): Promise<{
    source: string;
    games: LiteGame[];
    sourceAsOf?: string;
}> { return { source: GA_SOURCE, ...parseGa(await fetchText(GA_SOURCE)) }; }
