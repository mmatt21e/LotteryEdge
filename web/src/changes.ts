import { useEffect, useMemo, useRef } from "react";
import type { Game } from "./types.js";

export interface GameChange {
  topClaimed: number; // top-tier prizes claimed since last visit
  netDelta: number; // change in roi (+ = better value)
}

interface Snapshot {
  at: string;
  map: Record<string, { roi: number; top: number }>;
}

const EMPTY: Snapshot = { at: "", map: {} };

// Snapshots are keyed per state ("seen-nc", "seen-tx", …) so switching states
// never diffs one state's games against another's baseline. Managed directly
// (not via useLocalStorage) because that hook can't follow a changing key.
const storageKey = (state: string) => `seen-${state}`;

function readSnapshot(state: string): Snapshot {
  try {
    const raw = localStorage.getItem(storageKey(state));
    return raw ? (JSON.parse(raw) as Snapshot) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function writeSnapshot(state: string, s: Snapshot): void {
  try {
    localStorage.setItem(storageKey(state), JSON.stringify(s));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

/**
 * Diffs the current snapshot against the one from the user's previous visit
 * to THIS state (persisted in localStorage), then records the current one for
 * next time. The previous-visit baseline is frozen per state for the session
 * so badges don't flash away when the stored snapshot is overwritten.
 */
export function useChanges(
  games: Game[] | undefined,
  generatedAt: string | undefined,
  stateKey: string,
): Map<string, GameChange> {
  // First-read-per-state cache: the baseline each state is diffed against.
  const initialByState = useRef<Record<string, Snapshot>>({});
  if (!(stateKey in initialByState.current)) {
    initialByState.current[stateKey] = readSnapshot(stateKey);
  }
  const initial = initialByState.current[stateKey]!;

  const changes = useMemo(() => {
    const result = new Map<string, GameChange>();
    if (!games || !generatedAt || !initial.at || initial.at === generatedAt) return result;
    for (const g of games) {
      if (!g.computed) continue; // lite games carry no EV
      const prev = initial.map[g.gameId];
      if (!prev) continue;
      const topClaimed = Math.max(0, prev.top - g.computed.topPrizesRemaining);
      const netDelta = g.computed.roi - prev.roi;
      if (topClaimed > 0 || Math.abs(netDelta) >= 0.005) result.set(g.gameId, { topClaimed, netDelta });
    }
    return result;
  }, [games, generatedAt, initial]);

  useEffect(() => {
    if (!games || !generatedAt) return;
    if (readSnapshot(stateKey).at === generatedAt) return;
    const map: Record<string, { roi: number; top: number }> = {};
    for (const g of games)
      if (g.computed) map[g.gameId] = { roi: g.computed.roi, top: g.computed.topPrizesRemaining };
    writeSnapshot(stateKey, { at: generatedAt, map });
  }, [games, generatedAt, stateKey]);

  return changes;
}
