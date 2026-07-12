// VA discovery (iteration 4): nail down the prize-tier / remaining schema.
// valottery.com sits behind a bot cookie that isn't set on first paint, so we
// load -> wait -> reload to warm the session, then (1) intercept native API
// calls, (2) do warmed in-page fetches of the list + a detail endpoint, and
// (3) navigate to a physical scratcher detail page and dump its HTML + API.
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
const ctx = await browser.newContext({ userAgent: UA });
const page = await ctx.newPage();

const api = [];
page.on("response", async (res) => {
  if (!/\/api\/v1\/scratchers/i.test(res.url())) return;
  let b = "";
  try {
    b = await res.text();
  } catch {}
  api.push({ url: res.url(), status: res.status(), ct: res.headers().get?.("content-type") || "", len: b.length, body: b });
});

console.log("load 1");
await page.goto(PAGE, { waitUntil: "networkidle", timeout: 90000 }).catch((e) => console.log("goto1:", e.message));
await page.waitForTimeout(9000); // let the bot sensor set its cookie
console.log("reload to warm session");
await page.reload({ waitUntil: "networkidle", timeout: 90000 }).catch((e) => console.log("reload:", e.message));
await page.waitForTimeout(6000);

// Warmed in-page fetches (carry cookies)
const probe = await page.evaluate(async () => {
  const get = async (u) => {
    try {
      const r = await fetch(u, {
        headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
        credentials: "include",
      });
      return { url: u, status: r.status, ct: r.headers.get("content-type") || "", text: (await r.text()).slice(0, 150000) };
    } catch (e) {
      return { url: u, error: String(e) };
    }
  };
  const out = { list: await get("/api/v1/scratchers") };
  let id = null,
    title = null,
    totalPages = null;
  try {
    const d = JSON.parse(out.list.text);
    totalPages = d.totalPages;
    const g = (d.data || [])[0] || {};
    id = g.GameID;
    title = g.Title;
  } catch {}
  out.totalPages = totalPages;
  out.firstId = id;
  out.firstTitle = title;
  if (id) {
    out.detail = await get(`/api/v1/scratchers/${id}`);
    out.detail_prizes = await get(`/api/v1/scratchers/${id}/prizes`);
  }
  return out;
});

await writeFile(resolve(OUT, "probe.json"), JSON.stringify(probe, null, 2).slice(0, 400000));

// Navigate to a physical scratcher detail page (HTML) and dump it + any API hit.
const id = probe.firstId;
const slug = (probe.firstTitle || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const detailUrls = id
  ? [
      `https://www.valottery.com/scratchers/${id}`,
      `https://www.valottery.com/scratchers/${id}/${slug}`,
      `https://www.valottery.com/scratcher/${id}`,
    ]
  : [];
for (let i = 0; i < detailUrls.length; i++) {
  try {
    const resp = await page.goto(detailUrls[i], { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(3000);
    const html = await page.content();
    await writeFile(
      resolve(OUT, `detailpage-${i + 1}.html`),
      `<!-- ${detailUrls[i]} status ${resp && resp.status()} -->\n` + html.slice(0, 400000),
    );
  } catch (e) {
    await writeFile(resolve(OUT, `detailpage-${i + 1}.html`), `error ${detailUrls[i]}: ${e.message}`);
  }
}

// Save intercepted API bodies
for (let i = 0; i < api.length; i++) {
  await writeFile(
    resolve(OUT, `api-${String(i + 1).padStart(2, "0")}.txt`),
    `# ${api[i].url}\n# status ${api[i].status} len ${api[i].len}\n\n${api[i].body.slice(0, 150000)}`,
  );
}

await writeFile(
  resolve(OUT, "summary.json"),
  JSON.stringify(
    {
      firstId: probe.firstId,
      firstTitle: probe.firstTitle,
      totalPages: probe.totalPages,
      listStatus: probe.list?.status,
      listCt: probe.list?.ct,
      listLen: (probe.list?.text || "").length,
      detailStatus: probe.detail?.status,
      detailLen: (probe.detail?.text || "").length,
      detailPrizesStatus: probe.detail_prizes?.status,
      interceptedApi: api.map((a) => ({ url: a.url.slice(0, 120), status: a.status, len: a.len })),
    },
    null,
    2,
  ) + "\n",
);
console.log("firstId", probe.firstId, "listStatus", probe.list?.status, "detailStatus", probe.detail?.status);
console.log("intercepted", api.length, "api responses");
await browser.close();
