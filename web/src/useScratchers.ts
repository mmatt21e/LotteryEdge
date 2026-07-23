import { useCallback, useEffect, useState } from "react";
import type { AnyResult, History, Game, ScrapeResult } from "./types.js";
import { STATES } from "./states.js";

const BASE = import.meta.env.BASE_URL; // "/" locally, "/LotteryEdge/" on Pages

/** A data file for a state, served from the site's own origin (copied at build). */
function fileUrl(kind: "scratchers" | "history", state: string, bust: number): string {
  const b = bust ? `?t=${bust}` : "";
  return `${BASE}data/${kind}-${state}.json${b}`;
}

interface State {
  data: AnyResult | null;
  history: History | null;
  loading: boolean;
  error: string | null;
}

export function useScratchers(state: string) {
  const [s, setS] = useState<State>({
    data: null,
    history: null,
    loading: true,
    error: null,
  });

  const load = useCallback(
    async (bust = 0) => {
      // The combined view fetches its own data; there is no "all" file.
      if (state === "all") {
        setS({ data: null, history: null, loading: false, error: null });
        return;
      }
      // Initial load for a (possibly new) state: clear whatever is on screen so
      // a failed fetch can NEVER leave another state's games showing under this
      // state's name. Manual refresh (bust != 0) is the one case where keeping
      // the current data on failure is right — it's the same state's data.
      if (bust === 0) setS({ data: null, history: null, loading: true, error: null });
      else setS((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const opts: RequestInit = { cache: bust ? "reload" : "default" };
        const [dataRes, histRes] = await Promise.all([
          fetch(fileUrl("scratchers", state, bust), opts),
          // History is optional — tolerate its absence (early days).
          fetch(fileUrl("history", state, bust), opts).catch(() => null),
        ]);
        if (!dataRes.ok) throw new Error(`HTTP ${dataRes.status}`);
        const data = (await dataRes.json()) as AnyResult;
        const history =
          histRes && histRes.ok ? ((await histRes.json()) as History) : null;
        setS({ data, history, loading: false, error: null });
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

export interface AllState {
  games: Game[]; // every full-EV game across states, each tagged with its state
  loaded: string[]; // state keys that returned data
  failed: string[]; // full states with no published data yet
  generatedAt: string | null; // most recent snapshot across loaded states
  loading: boolean;
}

/**
 * Fetches every full-EV state in parallel and merges their games into one
 * list for the cross-state view. Lite states are skipped (no comparable EV).
 * A state with no data file yet is silently dropped into `failed`, never fatal.
 */
export function useAllScratchers() {
  const [s, setS] = useState<AllState>({
    games: [],
    loaded: [],
    failed: [],
    generatedAt: null,
    loading: true,
  });

  const load = useCallback(async (bust = 0) => {
    setS((prev) => ({ ...prev, loading: true }));
    const fullKeys = STATES.filter((st) => st.tier === "full").map((st) => st.key);
    const opts: RequestInit = { cache: bust ? "reload" : "default" };

    const results = await Promise.all(
      fullKeys.map(async (key) => {
        try {
          const res = await fetch(fileUrl("scratchers", key, bust), opts);
          if (!res.ok) return { key, data: null };
          const data = (await res.json()) as ScrapeResult;
          if ((data as unknown as { limited?: boolean }).limited) return { key, data: null };
          return { key, data };
        } catch {
          return { key, data: null };
        }
      }),
    );

    const games: Game[] = [];
    const loaded: string[] = [];
    const failed: string[] = [];
    let generatedAt: string | null = null;
    for (const { key, data } of results) {
      if (!data || !Array.isArray(data.games)) {
        failed.push(key);
        continue;
      }
      loaded.push(key);
      if (!generatedAt || data.generatedAt > generatedAt) generatedAt = data.generatedAt;
      // Stamp the state from the file so a card always knows its origin.
      for (const g of data.games) games.push({ ...g, state: key });
    }
    setS({ games, loaded, failed, generatedAt, loading: false });
  }, []);

  useEffect(() => {
    void load(0);
  }, [load]);

  const refresh = useCallback(() => load(Date.now()), [load]);

  return { ...s, refresh };
}
