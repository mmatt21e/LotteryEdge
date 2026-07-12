import { useCallback, useEffect, useState } from "react";
import type { AnyResult, History } from "./types.js";

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
      setS((prev) => ({ ...prev, loading: true, error: null }));
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
