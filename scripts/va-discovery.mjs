// VA discovery (iteration 3): the physical scratcher API
// (www.valottery.com/api/v1/scratchers) needs the site session, so we fetch it
// from INSIDE the loaded page (which carries the cookies). Pull every list page
// and probe candidate per-game detail routes to find prize-tier / remaining
// data. Runs in CI.
import { chromium } from "playwright";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "va-discovery");
const PAGE = "https://www.valottery.com/scratcher-search";

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
});
const page = await ctx.newPage();
await page.goto(PAGE, { waitUntil: "networkidle", timeout: 90000 }).catch((e) => console.log("goto:", e.message));
await page.waitForTimeout(4000);

// Everything below runs in the page's origin/session (cookies included).
const result = await page.evaluate(async () => {
  const get = async (url) => {
    try {
      const r = await fetch(url, {
        headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
        credentials: "include",
      });
      const text = await r.text();
      return { url, status: r.status, ct: r.headers.get("content-type") || "", text };
    } catch (e) {
      return { url, error: String(e) };
    }
  };

  // 1) All list pages
  const first = await get("/api/v1/scratchers?page=1");
  let totalPages = 1;
  try {
    totalPages = JSON.parse(first.text).totalPages || 1;
  } catch {}
  const pages = [first];
  for (let p = 2; p <= totalPages; p++) pages.push(await get(`/api/v1/scratchers?page=${p}`));

  // 2) Collect game IDs from the list
  const ids = [];
  for (const pg of pages) {
    try {
      for (const g of JSON.parse(pg.text).data || []) if (g.GameID) ids.push(g.GameID);
    } catch {}
  }

  // 3) Probe candidate detail routes for the first game
  const gid = ids[0];
  const candidates = gid
    ? [
        `/api/v1/scratchers/${gid}`,
        `/api/v1/scratchers/game/${gid}`,
        `/api/v1/scratchers/${gid}/prizes`,
        `/api/v1/scratchers/${gid}/prizetiers`,
        `/api/v1/scratchers/details/${gid}`,
        `/api/v1/scratcher/${gid}`,
      ]
    : [];
  const details = [];
  for (const c of candidates) details.push(await get(c));

  return { totalPages, idCount: ids.length, sampleIds: ids.slice(0, 5), pages, details };
});

// Write everything out
await writeFile(resolve(OUT, "list-page1.json"), result.pages[0]?.text || "");
for (let i = 0; i < result.details.length; i++) {
  const d = result.details[i];
  await writeFile(
    resolve(OUT, `detail-${i + 1}.txt`),
    `# ${d.url}\n# status ${d.status} ct ${d.ct} len ${(d.text || "").length}\n\n${(d.text || d.error || "").slice(0, 100000)}`,
  );
}
const summary = {
  totalPages: result.totalPages,
  idCount: result.idCount,
  sampleIds: result.sampleIds,
  detailProbes: result.details.map((d) => ({ url: d.url, status: d.status, ct: d.ct, len: (d.text || "").length })),
};
await writeFile(resolve(OUT, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
await browser.close();
