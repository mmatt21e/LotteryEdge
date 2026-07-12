// VA discovery (iteration 2): drive valottery.com/scratcher-search, interact
// with the price selectors, and capture EVERY data-ish response (not just the
// online-gaming sapi API) so we can locate the physical scratch-off
// prizes-remaining source. Runs in CI (open internet).
import { chromium } from "playwright";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "va-discovery");
const PAGE = "https://www.valottery.com/scratcher-search";
const ASSET = /\.(js|css|png|jpe?g|svg|gif|ico|woff2?|ttf|map|mp4|webp)(\?|$)/i;
const INTEREST = /prize|remain|odds|scratch|instant|ticket|gamenum|topprize/i;

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
});
const page = await ctx.newPage();

const manifest = [];
let n = 0;
page.on("response", async (res) => {
  const url = res.url();
  if (ASSET.test(url)) return;
  const ct = (res.headers()["content-type"] || "").toLowerCase();
  let body = "";
  try {
    body = await res.text();
  } catch {
    return;
  }
  const isJson = ct.includes("json") || /^[[{]/.test(body.trim());
  const relevant = INTEREST.test(body) || INTEREST.test(url);
  if (!isJson && !relevant) return; // skip plain HTML/chrome unless it looks relevant
  const idx = ++n;
  const file = `resp-${String(idx).padStart(2, "0")}.txt`;
  await writeFile(
    resolve(OUT, file),
    `# ${url}\n# content-type: ${ct}\n# status ${res.status()} len ${body.length}\n\n${body.slice(0, 200000)}`,
  );
  manifest.push({ idx, file, url: url.slice(0, 200), ct, status: res.status(), len: body.length, relevant });
  console.log(`#${idx} ${relevant ? "*" : " "} ${res.status()} ${ct.slice(0, 20)} ${body.length}b ${url.slice(0, 110)}`);
});

console.log("loading", PAGE);
await page.goto(PAGE, { waitUntil: "networkidle", timeout: 90000 }).catch((e) => console.log("goto:", e.message));
await page.waitForTimeout(6000);

// Drive every <select> through all options (price/category filters) to trigger loads.
try {
  const selects = await page.$$("select");
  console.log("selects found:", selects.length);
  for (const sel of selects) {
    const opts = await sel.$$eval("option", (os) => os.map((o) => o.value).filter(Boolean));
    for (const v of opts.slice(0, 12)) {
      await sel.selectOption(v).catch(() => {});
      await page.waitForTimeout(2500);
    }
  }
} catch (e) {
  console.log("select loop:", e.message);
}

// Click any obvious search/view/go buttons.
for (const label of ["SEARCH", "VIEW", "GO", "Search", "Apply"]) {
  try {
    const b = page.getByRole("button", { name: label });
    if (await b.count()) {
      await b.first().click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(3000);
    }
  } catch {
    /* ignore */
  }
}
await page.waitForTimeout(4000);

// Save the fully-rendered HTML too, in case the data is inlined after render.
try {
  const html = await page.content();
  await writeFile(resolve(OUT, "rendered.html"), html.slice(0, 500000));
} catch {
  /* ignore */
}

await writeFile(resolve(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`\nDone. ${manifest.length} candidate responses captured.`);
await browser.close();
