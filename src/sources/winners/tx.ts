import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchJson } from "../http.js";
import type { WinnerRecord } from "../../types.js";

/**
 * Texas — the Texas Open Data Portal (Socrata) publishes EVERY claim-center
 * prize claim (~$600+) with the selling retailer, its address/city, the
 * winner's name (unless anonymous), and the claim date. 1.7M+ scratch rows
 * back to 1993; updated ~daily. We pull the newest scratch-ticket claims.
 *
 *   https://data.texas.gov/resource/54pj-3dxy.json
 *     ?$where=game_category='Scratch Tickets'
 *     &$order=claim_paid_date DESC&$limit=...
 *
 * Scratch rows carry instant_game_number (not a name); the game name is
 * joined from our own data/scratchers-tx.json where the game is still
 * active, else shown as "Game #NNNN".
 */
const API_URL = "https://data.texas.gov/resource/54pj-3dxy.json";
const QUERY =
  "?$where=game_category='Scratch Tickets'&$order=claim_paid_date DESC&$limit=800";

interface TxRow {
  row_id?: string;
  won_amount?: string;
  claim_paid_date?: string; // ISO timestamp
  first_name?: string;
  last_name?: string;
  instant_game_number?: string;
  location_name?: string;
  location_address?: string;
  location_city?: string;
}

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "data");

/** instant_game_number -> game name, from our own scraped TX game list. */
async function loadGameNames(): Promise<Map<string, string>> {
  try {
    const raw = JSON.parse(await readFile(resolve(DATA_DIR, "scratchers-tx.json"), "utf8")) as {
      games?: { gameId: string; name: string }[];
    };
    return new Map((raw.games ?? []).map((g) => [g.gameId, g.name]));
  } catch {
    return new Map(); // ended games fall back to "Game #NNNN" labels anyway
  }
}

export function parseTxRows(rows: TxRow[], names: Map<string, string>): WinnerRecord[] {
  const winners: WinnerRecord[] = [];
  for (const r of rows) {
    const prize = Number(r.won_amount);
    const retailer = (r.location_name ?? "").trim();
    if (!retailer || !Number.isFinite(prize) || prize <= 0) continue;
    const gameNo = (r.instant_game_number ?? "").trim();
    const player = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
    winners.push({
      id: r.row_id,
      game: names.get(gameNo) ?? (gameNo ? `Game #${gameNo}` : "Scratch ticket"),
      gameId: gameNo || undefined,
      prize,
      retailer,
      city: (r.location_city ?? "").trim() || undefined,
      address: (r.location_address ?? "").trim() || undefined,
      player: player || undefined,
      date: r.claim_paid_date?.slice(0, 10),
      scratch: true, // query is filtered to Scratch Tickets
    });
  }
  return winners;
}

export async function scrapeTxWinners(): Promise<{ source: string; winners: WinnerRecord[] }> {
  const [rows, names] = await Promise.all([
    fetchJson<TxRow[]>(API_URL + QUERY, {}, 60_000),
    loadGameNames(),
  ]);
  const winners = parseTxRows(rows, names);
  if (winners.length === 0) throw new Error("TX winners: 0 rows parsed — dataset shape changed?");
  return { source: API_URL, winners };
}
