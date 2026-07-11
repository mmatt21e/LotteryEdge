import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { computeStats } from "./ev.js";
import { scrapeNc } from "./sources/nc.js";
import { scrapeVa } from "./sources/va.js";
import type { Game, ScrapeResult } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");

const SOURCES = {
  nc: scrapeNc,
  va: scrapeVa,
} as const;

type StateKey = keyof typeof SOURCES;

async function run(state: StateKey): Promise<ScrapeResult> {
  const { source, games: raw } = await SOURCES[state]();

  const games: Game[] = raw
    .map((g) => ({ ...g, computed: computeStats(g) }))
    // Rank best-value first.
    .sort((a, b) => b.computed.roi - a.computed.roi);

  return {
    // NOTE: stamped by the caller in CI via file mtime / commit; Date is used
    // here only at runtime, never inside pure logic.
    generatedAt: new Date().toISOString(),
    state,
    source,
    gameCount: games.length,
    games,
  };
}

async function main() {
  const arg = (process.argv[2] ?? "nc").toLowerCase();
  const states: StateKey[] =
    arg === "all" ? (Object.keys(SOURCES) as StateKey[]) : [arg as StateKey];

  await mkdir(DATA_DIR, { recursive: true });

  for (const state of states) {
    if (!(state in SOURCES)) {
      console.error(`Unknown state "${state}". Use: nc | va | all`);
      process.exitCode = 1;
      continue;
    }
    try {
      const result = await run(state);
      const out = resolve(DATA_DIR, `scratchers-${state}.json`);
      await writeFile(out, JSON.stringify(result, null, 2) + "\n");

      const top = result.games.slice(0, 5);
      console.log(`\n[${state.toUpperCase()}] ${result.gameCount} games -> ${out}`);
      console.log("Top 5 by ROI:");
      for (const g of top) {
        console.log(
          `  ${(g.computed.roi * 100).toFixed(1)}% ROI  $${g.price}  ` +
            `EV $${g.computed.evPerTicket.toFixed(2)}  ` +
            `top $${g.computed.topPrizeAmount.toLocaleString()} x${g.computed.topPrizesRemaining}  ` +
            `— ${g.name}`,
        );
      }
    } catch (err) {
      console.error(`[${state.toUpperCase()}] scrape failed:`, (err as Error).message);
      process.exitCode = 1;
    }
  }
}

main();
