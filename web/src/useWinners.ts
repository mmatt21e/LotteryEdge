import { useEffect, useState } from "react";
import type { WinnersResult } from "./types.js";

const BASE = import.meta.env.BASE_URL;

/**
 * Posted-winner data for a state, or null when the state has no winners feed
 * (most don't) or the file hasn't been published yet. Best-effort: any fetch
 * or parse failure (including SPA-fallback HTML for a missing file) is null.
 */
export function useWinners(state: string): WinnersResult | null {
  const [w, setW] = useState<WinnersResult | null>(null);

  useEffect(() => {
    let alive = true;
    setW(null);
    if (!state || state === "all") return;
    fetch(`${BASE}data/winners-${state}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: WinnersResult | null) => {
        if (alive) setW(j && Array.isArray(j.winners) ? j : null);
      })
      .catch(() => {
        if (alive) setW(null);
      });
    return () => {
      alive = false;
    };
  }, [state]);

  return w;
}
