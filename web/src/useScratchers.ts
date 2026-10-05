import { useCallback, useEffect, useRef, useState } from "react";
import type { AnyResult, History, Game } from "./types.js";
import { STATES } from "./states.js";
import { prepareSnapshot, reportingHistory, type Correction } from "./dataQuality.js";
import { freshnessRange, type FeedStatus, type FeedHealth } from "../../shared/quality.js";
const BASE = import.meta.env.BASE_URL;
const url = (file: string, bust: number) => `${BASE}data/${file}.json${bust ? `?t=${bust}` : ""}`;
async function optional<T>(file: string, bust: number, signal: AbortSignal): Promise<T | null> { try {
    const r = await fetch(url(file, bust), { signal, cache: bust ? "reload" : "default" });
    return r.ok ? await r.json() as T : null;
}
catch {
    return null;
} }
async function context(bust: number, signal: AbortSignal) { const [status, corrections] = await Promise.all([optional<FeedStatus>("status", bust, signal), optional<{
        corrections: Correction[];
    }>("corrections-v1", bust, signal)]); return { status, corrections: corrections?.corrections ?? [] }; }
interface State {
    data: AnyResult | null;
    history: History | null;
    loading: boolean;
    error: string | null;
}
export function useScratchers(state: string) {
    const [s, setS] = useState<State>({ data: null, history: null, loading: true, error: null });
    const request = useRef<AbortController | null>(null);
    const load = useCallback(async (bust = 0) => {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        if (state === "all") {
            setS({ data: null, history: null, loading: false, error: null });
            return;
        }
        setS(prev => ({ data: bust ? prev.data : null, history: bust ? prev.history : null, loading: true, error: null }));
        try {
            const [res, hist, ctx] = await Promise.all([fetch(url(`scratchers-${state}`, bust), { signal: controller.signal, cache: bust ? "reload" : "default" }), optional<History>(`history-${state}`, bust, controller.signal), context(bust, controller.signal)]);
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const raw = await res.json() as AnyResult;
            if (raw.state !== state)
                throw new Error("Snapshot jurisdiction mismatch");
            const data = prepareSnapshot(raw, ctx.status, ctx.corrections);
            if (!controller.signal.aborted)
                setS({ data, history: reportingHistory(hist), loading: false, error: null });
        }
        catch (e) {
            if (!controller.signal.aborted)
                setS(prev => ({ ...prev, data: prev.data ? prepareSnapshot(prev.data, { generatedAt: new Date().toISOString(), states: [{ state, ok: false, error: "Refresh failed: " + (e as Error).message }] }) : null, loading: false, error: (e as Error).message }));
        }
    }, [state]);
    useEffect(() => { void load(); return () => request.current?.abort(); }, [load]);
    // Re-evaluate age even if the app remains open overnight.
    useEffect(() => { const timer = setInterval(() => void load(), 3600000); return () => clearInterval(timer); }, [load]);
    return { ...s, refresh: useCallback(() => load(Date.now()), [load]) };
}
export interface AllState {
    games: Game[];
    loaded: string[];
    failed: string[];
    feeds: FeedHealth[];
    excludedCount: number;
    oldest: string | null;
    newest: string | null;
    loading: boolean;
}
export function useAllScratchers() {
    const [s, setS] = useState<AllState>({ games: [], loaded: [], failed: [], feeds: [], excludedCount: 0, oldest: null, newest: null, loading: true });
    const request = useRef<AbortController | null>(null);
    const load = useCallback(async (bust = 0) => {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        setS(prev => ({ ...prev, loading: true }));
        const ctx = await context(bust, controller.signal);
        const results = await Promise.all(STATES.filter(st => st.tier === "full").map(async ({ key }) => {
            try {
                const raw = await optional<AnyResult>(`scratchers-${key}`, bust, controller.signal);
                if (!raw || raw.state !== key || ("limited" in raw && raw.limited))
                    return { key, data: null };
                return { key, data: prepareSnapshot(raw, ctx.status, ctx.corrections) };
            }
            catch {
                return { key, data: null };
            }
        }));
        const games: Game[] = [], loaded: string[] = [], failed: string[] = [], feeds: FeedHealth[] = [];
        let excludedCount = 0;
        for (const { key, data } of results) {
            if (!data) {
                failed.push(key);
                continue;
            }
            if (data.health)
                feeds.push(data.health);
            excludedCount += data.excluded?.length ?? 0;
            if (!data.health?.eligible || !data.games.length) {
                failed.push(key);
                continue;
            }
            loaded.push(key);
            games.push(...data.games as Game[]);
        }
        if (!controller.signal.aborted)
            setS({ games, loaded, failed, feeds, excludedCount, ...freshnessRange(feeds.filter(f => loaded.includes(f.state))), loading: false });
    }, []);
    useEffect(() => { void load(); return () => request.current?.abort(); }, [load]);
    useEffect(() => { const timer = setInterval(() => void load(), 3600000); return () => clearInterval(timer); }, [load]);
    return { ...s, refresh: useCallback(() => load(Date.now()), [load]) };
}
