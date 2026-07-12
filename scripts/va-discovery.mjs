// VA discovery (iteration 5): capture the REQUEST HEADERS of the native
// /api/v1/scratchers call (which succeeds where our fetch 302s), and load a
// physical scratcher detail page to capture the prize-tier schema.
import { chromium } from "playwright";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "va-discovery");
const PAGE = "https://www.valottery.com/scratcher-search";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const RX = /\/api\/v1\/scratchers/i;

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ userAgent: UA });
const page = await ctx.newPage();

const reqs = [];
const resps = [];
page.on("request", (r) => {
  if (RX.test(r.url())) reqs.push({ url: r.url(), method: r.method(), headers: r.headers() });
});
page.on("response", async (res) => {
  if (!RX.test(res.url())) return;
  let b = "";
  try {
    b = await res.text();
  } catch {}
  resps.push({ url: res.url(), status: res.status(), ct: res.headers()["content-type"] || "", len: b.length, body: b });
});

console.log("load + warm");
await page.goto(PAGE, { waitUntil: "networkidle", timeout: 90000 }).catch((e) => console.log("goto:", e.message));
await page.waitForTimeout(9000);
await page.reload({ waitUntil: "networkidle", timeout: 90000 }).catch((e) => console.log("reload:", e.message));
await page.waitForTimeout(6000);

// Find the first physical scratcher link (has a GameID in href) and open it,
// so the site fires the native detail API call.
let clickedHref = null;
try {
  const href = await page.evaluate(() => {
    const a = [...document.querySelectorAll("a[href]")].find((x) =>
      /\/scratchers?\//i.test(x.getAttribute("href") || "") && /\d{3,}/.test(x.getAttribute("href") || ""),
    );
    return a ? a.href : null;
  });
  clickedHref = href;
  if (href) {
    await page.goto(href, { waitUntil: "networkidle", timeout: 60000 }).catch((e) => console.log("detail goto:", e.message));
    await page.waitForTimeout(5000);
    const html = await page.content();
    await writeFile(resolve(OUT, "detailpage.html"), `<!-- ${href} -->\n` + html.slice(0, 400000));
  }
} catch (e) {
  console.log("detail nav:", e.message);
}

// Also try direct detail URLs for GameID 2309 (known from prior capture).
for (const url of [
  "https://www.valottery.com/scratchers/2309",
  "https://www.valottery.com/scratchers/2309/1000000-gold-rush",
]) {
  try {
    const r = await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(3000);
    if (r && r.status() === 200) {
      await writeFile(resolve(OUT, `direct-${url.split("/").pop()}.html`), `<!-- ${url} -->\n` + (await page.content()).slice(0, 300000));
    }
  } catch {}
}

for (let i = 0; i < resps.length; i++) {
  await writeFile(resolve(OUT, `api-${String(i + 1).padStart(2, "0")}.txt`), `# ${resps[i].url}\n# ${resps[i].status} ${resps[i].ct} len ${resps[i].len}\n\n${resps[i].body.slice(0, 150000)}`);
}
await writeFile(resolve(OUT, "requests.json"), JSON.stringify(reqs, null, 2));
await writeFile(
  resolve(OUT, "summary.json"),
  JSON.stringify(
    {
      clickedHref,
      requests: reqs.map((r) => ({ method: r.method, url: r.url.slice(0, 130), headerKeys: Object.keys(r.headers) })),
      responses: resps.map((r) => ({ url: r.url.slice(0, 130), status: r.status, ct: r.ct, len: r.len })),
    },
    null,
    2,
  ) + "\n",
);
console.log("requests:", reqs.length, "responses:", resps.length, "clicked:", clickedHref);
await browser.close();
