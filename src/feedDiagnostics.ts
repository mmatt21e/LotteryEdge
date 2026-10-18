import { createHash } from "node:crypto";
import type { ContentObservation } from "../shared/feedDiagnostics.js";
import { feedCoverage } from "../shared/feedDiagnostics.js";
import { computeStats } from "./ev.js";
import type { RawGame, Game } from "./types.js";

/** Apply the unchanged EV guards while keeping collection/validation distinct. */
export function validateFullRecords(raw: RawGame[]) {
  const games: Game[] = [];
  const excluded: {gameId: string; name: string; reason: string}[] = [];
  for (const g of raw) {
    try { games.push({ ...g, computed: computeStats(g) }); }
    catch (error) { excluded.push({ gameId: g.gameId, name: g.name, reason: (error as Error).message }); }
  }
  games.sort((a, b) => b.computed.roi - a.computed.roi);
  return { games, excluded, coverage: feedCoverage(raw.length, games.length, excluded.length) };
}

// Game/tier order and object-key order do not change lottery content. Keep every
// row (including duplicates); dates and calculated EV are not part of raw input.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).sort().join(",") + "]";
  if (value !== null && typeof value === "object") {
    return "{" + Object.entries(value).filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v)).join(",") + "}";
  }
  return JSON.stringify(value) ?? "null";
}
export function observeContent(raw: unknown[], importedAt: string, previous?: ContentObservation): ContentObservation {
  const contentHash = createHash("sha256").update(canonical(raw)).digest("hex");
  const same = previous?.contentHash === contentHash;
  return { contentHash, unchangedRuns: same ? previous.unchangedRuns + 1 : 0,
    contentObservedSince: same ? previous.contentObservedSince : importedAt };
}
