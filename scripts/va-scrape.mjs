// VA scraper (lite): fetches the physical scratcher LIST via the site's own
// session (POST /api/v1/scratchers). VA does not publish per-tier
// prizes-remaining data, so this captures only what's public — name, price,
// top prize, and the "closing soon" flag — and writes a clearly-limited data
// file the PWA renders without EV. Runs in CI (open internet, Playwright).
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data");
const PAGE = "https://www.valottery.com/scratcher-search";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

/** "$50" -> 50 ; "$10" -> 10 */
function parsePrice(s) {
  const n = Number(String(s).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
/** "$1M*" -> 1000000 ; "$100,000" -> 100000 ; "$25K" -> 25000 */
function parseTopPrize(s) {
  const t = String(s).replace(/[,\s*]/g, "").toUpperCase();
  const m = /\$?([0-9.]+)(M|K)?/.exec(t);
  if (!m) return null;
  let v = Number(m[1]);
  if (!Number.isFinite(v)) return null;
  if (m[2] === "M") v *= 1_000_000;
  else if (m[2] === "K") v *= 1_000;
  return Math.round(v);
}

const browser = await chromium.launch();
const page = await (await browser.newContext({ userAgent: UA })).newPage();
await page.goto(PAGE, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(8000); // warm the bot cookie

const raw = await page.evaluate(async () => {
  const $ = window.jQuery || window.$;
  if (!$) throw new Error("no jQuery on page");
  const ajax = (page, pageSize) =>
    new Promise((res, rej) => {
      $.ajax({
        url: "/api/v1/scratchers",
        type: "POST",
        // Match the site's own request body exactly.
        data: `page=${page}&totalPages=0&pageSize=${pageSize}&filters[categories][]=all`,
        contentType: "application/x-www-form-urlencoded; charset=UTF-8",
        dataType: "json",
      })
        .done((d) => res(d))
        .fail((x) => rej(new Error("ajax " + x.status)));
    });

  const first = await ajax(0, 18);
  const total = first.totalPages || 1;
  const all = [...(first.data || [])];
  for (let p = 1; p < total; p++) {
    const d = await ajax(p, 18);
    all.push(...(d.data || []));
  }
  return all;
});

await browser.close();

const games = raw
  .map((g) => ({
    gameId: String(g.GameID),
    name: String(g.Title || "").trim(),
    price: parsePrice(g.TicketPrice),
    topPrize: String(g.TopPrize || "").trim(),
    topPrizeValue: parseTopPrize(g.TopPrize),
    closingSoon: Boolean(g.IsClosingSoon),
  }))
  .filter((g) => g.gameId && g.name);

if (games.length === 0) throw new Error("VA scrape produced 0 games");

const result = {
  generatedAt: new Date().toISOString(),
  state: "va",
  limited: true,
  source: "https://www.valottery.com/api/v1/scratchers",
  gameCount: games.length,
  games,
};
await mkdir(DATA, { recursive: true });
await writeFile(resolve(DATA, "scratchers-va.json"), JSON.stringify(result, null, 2) + "\n");
console.log(`VA: wrote ${games.length} games; ${games.filter((g) => g.closingSoon).length} closing soon`);
