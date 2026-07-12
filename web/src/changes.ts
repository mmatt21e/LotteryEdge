import { useEffect, useMemo, useRef } from "react";
import { useLocalStorage } from "./storage.js";
import type { Game } from "./types.js";

export interface GameChange {
  topClaimed: number; // top-tier prizes claimed since last visit
  netDelta: number; // change in roi (+ = better value)
}

interface Snapshot {
  at: string;
  map: Record<string, { roi: number; top: number }>;
}

/**
 * Diffs the current snapshot against the one from the user's previous visit
 * (persisted in localStorage), then records the current one for next time.
 * The result is frozen for the session so badges don't flash away.
 */
export function useChanges(
  games: Game[] | undefined,
  generatedAt: string | undefined,
): Map<string, GameChange> {
  const [seen, setSeen] = useLocalStorage<Snapshot>("seen-nc", { at: "", map: {} });
  const initial = useRef(seen).current; // captured once, before we overwrite

  const changes = useMemo(() => {
    const result = new Map<string, GameChange>();
    if (!games || !generatedAt || !initial.at || initial.at === generatedAt) return result;
    for (const g of games) {
      const prev = initial.map[g.gameId];
      if (!prev) continue;
      const topClaimed = Math.max(0, prev.top - g.computed.topPrizesRemaining);
      const netDelta = g.computed.roi - prev.roi;
      if (topClaimed > 0 || Math.abs(netDelta) >= 0.005) result.set(g.gameId, { topClaimed, netDelta });
    }
    return result;
  }, [games, generatedAt, initial]);

  useEffect(() => {
    if (!games || !generatedAt || seen.at === generatedAt) return;
    const map: Record<string, { roi: number; top: number }> = {};
    for (const g of games) map[g.gameId] = { roi: g.computed.roi, top: g.computed.topPrizesRemaining };
    setSeen({ at: generatedAt, map });
  }, [games, generatedAt, seen.at, setSeen]);

  return changes;
}
