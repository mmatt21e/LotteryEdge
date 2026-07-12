// One-time discovery: drive valottery.com/scratcher-search in a headless
// browser, capture every ScratchCards/sapi.aspx response, and write them to
// data/va-discovery/ so we can reverse-engineer the format and build a parser.
//
// Runs in CI (open internet). Not part of the daily job.
import { chromium } from "playwright";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "va-discovery");
const PAGE = "https://www.valottery.com/scratcher-search";
const MATCH = /sapi\.aspx/i;

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
  if (!MATCH.test(url)) return;
  let body = "";
  try {
    body = await res.text();
  } catch {
    body = "<<unreadable>>";
  }
  const idx = ++n;
  const file = `resp-${String(idx).padStart(2, "0")}.txt`;
  await writeFile(resolve(OUT, file), `# ${url}\n# status ${res.status()} len ${body.length}\n\n${body}`);
  manifest.push({ idx, file, url, status: res.status(), len: body.length });
  console.log(`captured #${idx} (${body.length}b) ${url.slice(0, 120)}`);
});

console.log("loading", PAGE);
await page.goto(PAGE, { waitUntil: "networkidle", timeout: 90000 }).catch((e) => console.log("goto:", e.message));
await page.waitForTimeout(8000);

// Try to open a scratcher detail to trigger a per-game (prize-level) call.
const clickTargets = [
  "a[href*='scratcher' i]",
  "[onclick*='loadGame' i]",
  "[class*='scratcher' i]",
  "[class*='game' i] a",
  ".game-tile, .scratcher-tile, .card a",
];
for (const sel of clickTargets) {
  try {
    const el = await page.$(sel);
    if (el) {
      console.log("clicking", sel);
      await el.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(5000);
      break;
    }
  } catch {
    /* keep trying */
  }
}
await page.waitForTimeout(4000);

// Dump a snapshot of the rendered DOM text too (helps if data is inlined).
try {
  const text = await page.evaluate(() => document.body.innerText.slice(0, 4000));
  await writeFile(resolve(OUT, "page-text.txt"), text);
} catch {
  /* ignore */
}

await writeFile(resolve(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`\nDone. ${manifest.length} sapi responses captured.`);
await browser.close();
if (manifest.length === 0) process.exitCode = 1;
