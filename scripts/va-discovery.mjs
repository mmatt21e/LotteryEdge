// VA discovery (iteration 7): capture native POST BODIES for /api/v1/* calls
// (the list needs its full options object) and follow a physical scratcher tile
// to see how prize tiers are delivered.
import { chromium } from "playwright";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "va-discovery");
const PAGE = "https://www.valottery.com/scratcher-search";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const RX = /\/api\/v1\//i;

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await (await browser.newContext({ userAgent: UA })).newPage();

const calls = [];
page.on("request", (r) => {
  if (RX.test(r.url())) calls.push({ phase: "req", url: r.url(), method: r.method(), postData: r.postData() });
});
page.on("response", async (res) => {
  if (!RX.test(res.url())) return;
  let b = "";
  try {
    b = await res.text();
  } catch {}
  calls.push({ phase: "res", url: res.url(), status: res.status(), ct: res.headers()["content-type"] || "", len: b.length, sample: b.slice(0, 4000) });
});

await page.goto(PAGE, { waitUntil: "networkidle", timeout: 90000 }).catch((e) => console.log("goto:", e.message));
await page.waitForTimeout(8000);

// The rendered results live in #scratcher-tiles. Grab the first tile's link and
// any "prizes and odds" trigger, then follow/activate them.
const info = await page.evaluate(() => {
  const tiles = document.querySelector("#scratcher-tiles");
  const firstLink = tiles ? tiles.querySelector("a[href]") : null;
  const anchors = [...(tiles ? tiles.querySelectorAll("a[href]") : [])].slice(0, 3).map((a) => a.href);
  const prizeTriggers = [...document.querySelectorAll('[data-target*="prize" i],[href*="prize" i],[onclick*="prize" i]')]
    .slice(0, 3)
    .map((e) => e.outerHTML.slice(0, 120));
  return { firstHref: firstLink ? firstLink.href : null, anchors, prizeTriggers, tilesHtml: (tiles ? tiles.innerHTML : "").slice(0, 3000) };
});
await writeFile(resolve(OUT, "tiles.html"), info.tilesHtml || "");

if (info.firstHref) {
  await page.goto(info.firstHref, { waitUntil: "networkidle", timeout: 60000 }).catch((e) => console.log("detail:", e.message));
  await page.waitForTimeout(6000);
  // Click any prizes-and-odds trigger on the detail page.
  for (const sel of ['a:has-text("Prizes")', 'button:has-text("Prizes")', '[data-target*="prize" i]', 'a:has-text("Odds")']) {
    try {
      const el = page.locator(sel).first();
      if (await el.count()) {
        await el.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(3000);
      }
    } catch {}
  }
  await writeFile(resolve(OUT, "detail.html"), (await page.content()).slice(0, 400000));
}

await writeFile(resolve(OUT, "calls.json"), JSON.stringify(calls, null, 2).slice(0, 400000));
await writeFile(resolve(OUT, "info.json"), JSON.stringify({ firstHref: info.firstHref, anchors: info.anchors, prizeTriggers: info.prizeTriggers }, null, 2));
const listReq = calls.find((c) => c.phase === "req" && /scratchers(\?|$)/.test(c.url) && c.method === "POST");
console.log("native list POST body:", listReq ? listReq.postData : "(none)");
console.log("api calls:", calls.filter((c) => c.phase === "req").map((c) => `${c.method} ${c.url.split("/api/v1/")[1]}`).join(", "));
await browser.close();
