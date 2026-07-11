import { useCallback, useEffect, useState } from "react";
import type { ScrapeResult } from "./types.js";

const BASE = import.meta.env.BASE_URL; // "/" locally, "/LotteryEdge/" on Pages

/** Data file per state, served from the site's own origin (copied at build). */
function dataUrl(state: string, bust: number): string {
  const b = bust ? `?t=${bust}` : "";
  return `${BASE}data/scratchers-${state}.json${b}`;
}

interface State {
  data: ScrapeResult | null;
  loading: boolean;
  error: string | null;
}

export function useScratchers(state: string) {
  const [s, setS] = useState<State>({ data: null, loading: true, error: null });

  const load = useCallback(
    async (bust = 0) => {
      setS((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const res = await fetch(dataUrl(state, bust), { cache: bust ? "reload" : "default" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ScrapeResult;
        setS({ data, loading: false, error: null });
      } catch (err) {
        setS((prev) => ({ ...prev, loading: false, error: (err as Error).message }));
      }
    },
    [state],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  const refresh = useCallback(() => load(Date.now()), [load]);

  return { ...s, refresh };
}
