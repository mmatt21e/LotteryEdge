import { feedCoverage } from "../../shared/feedDiagnostics.js";
import { computedIssues, feedHealth, previousCalendarDay, QUALITY_VERSION, type FeedStatus, type FeedHealth } from "../../shared/quality.js";
import type { AnyResult, Game, History, LiteGame } from "./types.js";
export interface ExcludedGame {
    gameId: string;
    name: string;
    reason: string;
}
export interface Correction {
    id: string;
    state: string;
    verifiedAt: string;
    reason: string;
    snapshot: AnyResult;
}
export function prepareSnapshot(input: AnyResult, status: FeedStatus | null, corrections: Correction[] = [], now = Date.now()): AnyResult {
    const correction = corrections.find(c => c.state === input.state && Date.parse(input.generatedAt) < Date.parse(c.verifiedAt));
    const data = correction?.snapshot ?? input;
    if (!Array.isArray(data.games))
        throw new Error("Published games list is invalid");
    const excluded: ExcludedGame[] = [...(data.excluded ?? [])], ids = new Map<string, number>();
    data.games.forEach(g => ids.set(g.gameId, (ids.get(g.gameId) ?? 0) + 1));
    const full = !("limited" in data && data.limited);
    const validated = data.games.filter(g => {
        const reasons: string[] = [];
        if (ids.get(g.gameId) !== 1)
            reasons.push("Duplicate game ID");
        if (full) {
            reasons.push(...computedIssues(g as Game));
        }
        else {
            const lite = g as LiteGame;
            if (!Number.isFinite(lite.price) || lite.price <= 0)
                reasons.push("Invalid price");
            if (lite.topPrizeValue !== null && (!Number.isFinite(lite.topPrizeValue) || lite.topPrizeValue < 0))
                reasons.push("Invalid top prize");
            if (data.state === "ga" && !data.validationVersion)
                reasons.push("Legacy GA monetary units unverified; official correction required");
        }
        if (reasons.length)
            excluded.push({ gameId: g.gameId, name: g.name, reason: [...new Set(reasons)].join("; ") });
        return reasons.length === 0;
    });
    // Derive coverage before freshness gating. Stale-but-valid records are not
    // validation failures, and legacy snapshots need no migration to show counts.
    const coverage = feedCoverage(data.games.length + (data.excluded?.length ?? 0), validated.length, excluded.length);
    const health = feedHealth({ ...data, coverage }, status, now);
    if (correction) health.correction = correction.id + ": " + correction.reason;
    const games = validated.filter(g => {
        if (full && !health.eligible) {
            excluded.push({ gameId: g.gameId, name: g.name, reason: health.reasons.join("; ") });
            return false;
        }
        return true;
    }).map(g => ({ ...g, ...(full ? { feed: health } : {}) }));
    return { ...data, games, health, coverage, excluded, validationVersion: QUALITY_VERSION } as AnyResult;
}
/** Display projection only: original history files and snapshot dates are retained. */
export function reportingHistory(history: History | null): History | null {
    if (!history)
        return null;
    return { ...history, series: Object.fromEntries(Object.entries(history.series).map(([id, s]) => [id, { ...s, points: s.points.map(point => {
                    let date = point.resultsAsOf;
                    if (!date) {
                        try {
                            date = previousCalendarDay(point.date);
                        }
                        catch {
                            date = point.date;
                        }
                    }
                    return { ...point, snapshotDate: point.date, date, dateBasis: point.dateBasis ?? "assumed-previous-day" as const };
                }) }])) };
}
export function healthSummary(feeds: FeedHealth[]): string { return feeds.filter(f => !f.eligible).map(f => `${f.state.toUpperCase()}: ${f.reasons.join("; ")}`).join(" | "); }
