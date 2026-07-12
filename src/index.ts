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

async function main() {
  const arg = (process.argv[2] ?? "all").toLowerCase();
  const targets =
    arg === "all" ? sourceKeys() : arg.split(",").map((s) => s.trim());

  await mkdir(DATA_DIR, { recursive: true });

  for (const key of targets) {
    const src = getSource(key);
    if (!src) {
      console.error(`Unknown state "${key}". Known: ${sourceKeys().join(", ")}`);
      process.exitCode = 1;
      continue;
    }
    try {
      if (src.kind === "full") await runFull(src);
      else await runLite(src);
    } catch (err) {
      console.error(`[${key.toUpperCase()}] scrape failed:`, (err as Error).message);
      process.exitCode = 1;
    }
  }
}

main();
