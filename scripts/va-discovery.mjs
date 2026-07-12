// VA discovery (iteration 6, final): use the PAGE'S OWN jQuery to POST the
// scratcher list and /api/v1/prizesandodds (same headers the site uses, so no
// 302). Captures the prize-tier schema needed to build the scraper.
import { chromium } from "playwright";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "va-discovery");
const PAGE = "https://www.valottery.com/scratcher-search";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await (await browser.newContext({ userAgent: UA })).newPage();
await page.goto(PAGE, { waitUntil: "networkidle", timeout: 90000 }).catch((e) => console.log("goto:", e.message));
await page.waitForTimeout(8000);

const data = await page.evaluate(async () => {
  const $ = window.jQuery || window.$;
  if (!$) return { error: "no jQuery on page" };
  const ajax = (url, body) =>
    new Promise((res) => {
      $.ajax({ url, type: "POST", data: body, dataType: "json" })
        .done((d) => res({ ok: true, data: d }))
        .fail((x) => res({ ok: false, status: x.status, text: (x.responseText || "").slice(0, 300) }));
    });

  const out = {};
  const p1 = await ajax("/api/v1/scratchers", { page: 1 });
  out.listPage1 = p1;
  let gid = null;
  if (p1.ok && p1.data && p1.data.data && p1.data.data.length) {
    out.totalPages = p1.data.totalPages;
    gid = p1.data.data[0].GameID;
  }
  const p2 = await ajax("/api/v1/scratchers", { page: 2 });
  out.listPage2Count = p2.ok ? (p2.data.data || []).length : p2;

  out.gameId = gid;
  if (gid) {
    out.prizesAndOdds = await ajax("/api/v1/prizesandodds", { gameId: gid });
    out.prizesAndOdds_withDate = await ajax("/api/v1/prizesandodds", { gameId: gid, drawingDate: "" });
  }
  return out;
});

await writeFile(resolve(OUT, "final.json"), JSON.stringify(data, null, 2).slice(0, 400000));
const po = data.prizesAndOdds || {};
console.log("gameId", data.gameId, "listOK", data.listPage1?.ok, "totalPages", data.totalPages);
console.log("prizesAndOdds ok:", po.ok, "status:", po.status);
if (po.ok) console.log("PO sample keys:", JSON.stringify(po.data).slice(0, 600));
await browser.close();
