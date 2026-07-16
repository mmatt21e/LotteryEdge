import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { computeStats } from "./ev.js";
import { loadHistory, saveHistory, upsertHistory } from "./history.js";
import { getSource, sourceKeys, type CliSource } from "./sources/registry.js";
import type { Game, ScrapeResult, LiteResult } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");

/**
 * Sanity gate: legitimate scratch-off ROI tops out near break-even (~1.0–1.3).
 * A cluster of wildly-high ROIs means the adapter captured incomplete tiers
 * (missing low tiers or bad remaining counts), which detonates the EV estimate.
 * Refuse to publish such data rather than mislead.
 */
function assertSaneRois(state: string, games: Game[]): void {
  if (games.length === 0) return;
  const rois = games.map((g) => g.computed.roi);
  const maxRoi = Math.max(...rois);
  const absurdShare = rois.filter((r) => r > 3).length / rois.length;
  if (maxRoi > 5 || absurdShare > 0.1) {
    throw new Error(
      `sanity check failed — maxROI=${(maxRoi * 100).toFixed(0)}%, ` +
        `${(absurdShare * 100).toFixed(0)}% of games >300% ROI. Likely incomplete tier data; holding ${state}.`,
    );
  }
}

async function runFull(src: CliSource & { kind: "full" }): Promise<void> {
  const { source, games: raw } = await src.scrape();
  const games: Game[] = raw
    .map((g) => ({ ...g, computed: computeStats(g) }))
    .sort((a, b) => b.computed.roi - a.computed.roi);

  assertSaneRois(src.key, games);

  const result: ScrapeResult = {
    generatedAt: new Date().toISOString(),
    state: src.key,
    source,
    gameCount: games.length,
    games,
  };
  await writeFile(
    resolve(DATA_DIR, `scratchers-${src.key}.json`),
    JSON.stringify(result, null, 2) + "\n",
  );

  // Append today's snapshot to the running time-series.
  const histPath = resolve(DATA_DIR, `history-${src.key}.json`);
  const date = result.generatedAt.slice(0, 10);
  const prev = await loadHistory(histPath);
  await saveHistory(histPath, upsertHistory(prev, src.key, games, date, result.generatedAt));

  const top = games.slice(0, 3);
  console.log(`[${src.key.toUpperCase()}] ${games.length} games`);
  for (const g of top) {
    console.log(
      `  ${(g.computed.roi * 100).toFixed(1)}% ROI  $${g.price}  ${g.name} ` +
        `(EV $${g.computed.evPerTicket.toFixed(2)})`,
    );
  }
}

async function runLite(src: CliSource & { kind: "lite" }): Promise<void> {
  const { source, games } = await src.scrape();
  const result: LiteResult = {
    generatedAt: new Date().toISOString(),
    state: src.key,
    limited: true,
    source,
    gameCount: games.length,
    games,
  };
  await writeFile(
    resolve(DATA_DIR, `scratchers-${src.key}.json`),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(`[${src.key.toUpperCase()}] ${games.length} games (lite)`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Scrape one state, retrying once on failure. Returns true on success. A state
 * that ultimately fails keeps its last-good committed data file (we never
 * delete on failure), so the app just shows slightly-staler data for it.
 */
async function scrapeOne(src: CliSource): Promise<boolean> {
  const run = () => (src.kind === "full" ? runFull(src) : runLite(src));
  try {
    await run();
    return true;
  } catch (err) {
    console.warn(
      `[${src.key.toUpperCase()}] attempt 1 failed: ${(err as Error).message} — retrying in 3s`,
    );
    await sleep(3000);
    try {
      await run();
      return true;
    } catch (err2) {
      console.error(`[${src.key.toUpperCase()}] scrape failed: ${(err2 as Error).message}`);
      return false;
    }
  }
}

/**
 * Fraction of states allowed to fail before we treat it as a systemic outage
 * and fail the CI job. Below this, a few flaky third-party sites (e.g. Ohio's
 * auth endpoint returning a transient 404) must NOT block the daily deploy —
 * the other states' fresh data still ships.
 */
const FAIL_JOB_THRESHOLD = 0.34;

async function main() {
  const arg = (process.argv[2] ?? "all").toLowerCase();
  const targets =
    arg === "all" ? sourceKeys() : arg.split(",").map((s) => s.trim());

  await mkdir(DATA_DIR, { recursive: true });

  const failed: string[] = [];
  for (const key of targets) {
    const src = getSource(key);
    if (!src) {
      console.error(`Unknown state "${key}". Known: ${sourceKeys().join(", ")}`);
      failed.push(key);
      continue;
    }
    if (!(await scrapeOne(src))) failed.push(key);
  }

  const total = targets.length;
  const okCount = total - failed.length;
  console.log(
    `\n[scrape] ${okCount}/${total} states OK` +
      (failed.length ? ` · failed: ${failed.join(", ")}` : ""),
  );

  // Only fail the job on a systemic outage (nothing worked, or too many did
  // not). A handful of flaky sites is expected and must not skip the deploy.
  if (okCount === 0 || failed.length / total > FAIL_JOB_THRESHOLD) {
    console.error(
      `[scrape] ${failed.length}/${total} states failed — above ${Math.round(
        FAIL_JOB_THRESHOLD * 100,
      )}% threshold; failing the job.`,
    );
    process.exitCode = 1;
  }
}

main();
