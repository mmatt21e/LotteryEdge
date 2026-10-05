/** Read-only validation: fetch one NE PDF (or inspect a supplied local PDF), never publish data. */
import { appendFile, readFile } from "node:fs/promises";
import { NE_PDF_URL, parseNePdf, scrapeNe } from "../src/sources/ne.js";
import { neReportingDate } from "../src/sources/ne-reporting.js";

async function main() {
  const file = process.argv[2];
  const result = file
    ? { source: NE_PDF_URL, ...await parseNePdf(await readFile(file)) }
    : await scrapeNe();
  const generatedAt = new Date().toISOString();
  const dates = neReportingDate(generatedAt, result.sourceAsOf);
  if (!result.games.length || new Set(result.games.map(g => g.gameId)).size !== result.games.length)
    throw new Error("NE empty or duplicate game list");
  for (const game of result.games) {
    if (!game.name || !/^\d{3,5}$/.test(game.gameId) || !Number.isSafeInteger(game.price) || game.price <= 0 ||
        !Number.isFinite(game.topPrizeValue) || game.topPrizeValue! <= 0 || "computed" in game)
      throw new Error("NE invalid limited-data game: " + game.gameId);
  }
  const evidence = { state: "ne", limited: true, validationOnly: true, mode: file ? "local-file" : "official-source",
    source: result.source, generatedAt, ...dates, gameCount: result.games.length };
  console.log(JSON.stringify(evidence, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `### Nebraska PDF validation\n\n- Games: ${result.games.length} (top prizes only; no EV)\n` +
      `- Official results date: ${dates.resultsAsOf}\n- Actual validation time: ${generatedAt}\n` +
      `- Mode: ${evidence.mode}\n- No data commits, winner/history changes, or deployment.\n`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
