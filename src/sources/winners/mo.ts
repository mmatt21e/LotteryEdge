import { inflateRawSync } from "node:zlib";
import * as cheerio from "cheerio";
import { UA } from "../http.js";
import { num } from "../parse.js";
import type { WinnerRecord } from "../../types.js";

/**
 * Missouri "Monthly Winners" — the strongest posted-winner source found:
 * every winning ticket over $1,000 sold in the prior month, with the selling
 * retailer, its street address and city, the game, and the amount. Published
 * as a single XLSX that is overwritten monthly; the CLI's merge accumulates
 * months over time (records carry the month as their date).
 *
 *   https://www.molottery.com/monthly-winner/MonthlyWinningsWeb.xlsx
 *   Sheet1: row 1 = "June 2026" month label, row 2 = header
 *   (City | Retailer | Address | Game Name | Amount Won), then ~1,700 rows.
 *
 * No winner names (MO allows anonymity); date granularity is the month.
 */
const XLSX_URL = "https://www.molottery.com/monthly-winner/MonthlyWinningsWeb.xlsx";

/** Draw games appearing in the monthly file — everything else is a scratcher. */
const DRAW_GAMES = new Set([
  "POWERBALL",
  "MEGA MILLIONS",
  "LOTTO",
  "SHOW ME CASH",
  "PICK 3",
  "PICK 4",
  "CASH4LIFE",
  "CASH POP",
  "CLUB KENO",
  "MO MILLIONS",
]);

/**
 * Minimal ZIP reader (an .xlsx is a ZIP): walk the central directory and
 * inflate each entry. Handles only what Office writers produce — stored (0)
 * and deflated (8) entries, no ZIP64 — which is all this 80 KB file needs.
 */
export function unzip(buf: Buffer): Map<string, Buffer> {
  let i = buf.length - 22; // minimal EOCD size; scan back past any comment
  while (i >= 0 && buf.readUInt32LE(i) !== 0x06054b50) i--;
  if (i < 0) throw new Error("MO xlsx: not a ZIP (no end-of-central-directory)");
  const count = buf.readUInt16LE(i + 10);
  let off = buf.readUInt32LE(i + 16);
  const out = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error("MO xlsx: bad central directory");
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const data = buf.subarray(start, start + csize);
    if (method !== 0 && method !== 8)
      throw new Error(`MO xlsx: unsupported compression method ${method}`);
    out.set(name, method === 0 ? Buffer.from(data) : inflateRawSync(data));
    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** Sheet1 rows as column-letter -> string maps (shared strings resolved). */
function sheetRows(entries: Map<string, Buffer>): Record<string, string>[] {
  const load = (name: string) => {
    const e = entries.get(name);
    if (!e) throw new Error(`MO xlsx: missing ${name}`);
    return cheerio.load(e.toString("utf8"), { xmlMode: true });
  };
  const $s = load("xl/sharedStrings.xml");
  const strings = $s("si")
    .map((_, si) => $s(si).find("t").text())
    .get();
  const $w = load("xl/worksheets/sheet1.xml");
  const rows: Record<string, string>[] = [];
  $w("row").each((_, r) => {
    const cells: Record<string, string> = {};
    $w(r)
      .find("c")
      .each((_, c) => {
        const col = ($w(c).attr("r") ?? "").replace(/\d+/g, "");
        const v = $w(c).find("v").text();
        cells[col] = $w(c).attr("t") === "s" ? (strings[Number(v)] ?? "") : v;
      });
    rows.push(cells);
  });
  return rows;
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** "June 2026" -> "2026-06-01" (month granularity — MO gives no exact dates). */
function monthToDate(label: string): string | undefined {
  const m = /^([A-Za-z]+)\s+(\d{4})$/.exec(label.trim());
  if (!m) return undefined;
  const idx = MONTHS.indexOf(m[1]!.toLowerCase());
  if (idx < 0) return undefined;
  return `${m[2]}-${String(idx + 1).padStart(2, "0")}-01`;
}

export function parseMoWinners(xlsx: Buffer): WinnerRecord[] {
  const rows = sheetRows(unzip(xlsx));
  // Row layout: month label row, then the header row, then data.
  const headerIdx = rows.findIndex((r) => r.A === "City" && r.B === "Retailer");
  if (headerIdx < 0) throw new Error("MO xlsx: header row not found — layout changed?");
  const date = monthToDate(rows[0]?.A ?? "");

  const winners: WinnerRecord[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const retailer = (r.B ?? "").trim();
    const game = (r.D ?? "").trim();
    const prize = num(r.E);
    if (!retailer || !game || !Number.isFinite(prize) || prize <= 0) continue;
    winners.push({
      game,
      prize,
      retailer,
      city: (r.A ?? "").trim() || undefined,
      address: (r.C ?? "").trim() || undefined,
      date,
      scratch: !DRAW_GAMES.has(game.toUpperCase()),
    });
  }
  return winners;
}

export async function scrapeMoWinners(): Promise<{ source: string; winners: WinnerRecord[] }> {
  const res = await fetch(XLSX_URL, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`GET ${XLSX_URL} -> ${res.status} ${res.statusText}`);
  const winners = parseMoWinners(Buffer.from(await res.arrayBuffer()));
  if (winners.length === 0) throw new Error("MO winners: 0 rows parsed — file layout changed?");
  return { source: XLSX_URL, winners };
}
