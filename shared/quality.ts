import { SOURCE_PAUSES } from "./sourceAccess.js";
export const QUALITY_VERSION = "2026-10-05.1";
export const SOURCE_ZONES: Record<string, string> = Object.fromEntries([
    ..."nc sc ga fl ct dc de ky ma md me mi nh nj ny oh pa ri va vt wv".split(" ").map(k => [k, "America/New_York"]),
    ..."ar ia ks la mn mo ms ne ok sd tx wi".split(" ").map(k => [k, "America/Chicago"]),
    ..."co id nm".split(" ").map(k => [k, "America/Denver"]), ..."ca or wa".split(" ").map(k => [k, "America/Los_Angeles"])
]);
export interface ReportingDate {
    resultsAsOf: string;
    dateBasis: "source" | "assumed-previous-day";
    timeZone: string;
}
export interface SnapshotDates {
    generatedAt: string;
    sourceAsOf?: string;
    resultsAsOf?: string;
    dateBasis?: ReportingDate["dateBasis"];
    timeZone?: string;
    state: string;
}
export function validDate(v: unknown): v is string { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v + "T12:00:00Z")) && new Date(v + "T12:00:00Z").toISOString().slice(0, 10) === v; }
export function calendarDay(timestamp: string, timeZone: string): string {
    if (!Number.isFinite(Date.parse(timestamp)))
        throw new Error("Import timestamp unavailable");
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(timestamp));
    const part = (kind: string) => parts.find(p => p.type === kind)!.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
}
export function previousCalendarDay(day: string): string { if (!validDate(day))
    throw new Error("Invalid calendar date"); const d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }
export function reportingDate(importedAt: string, state: string, sourceAsOf?: string, zone?: string): ReportingDate {
    const timeZone = zone ?? SOURCE_ZONES[state] ?? "UTC", local = calendarDay(importedAt, timeZone);
    if (sourceAsOf !== undefined && (!validDate(sourceAsOf) || sourceAsOf > local))
        throw new Error("Invalid or future source results date");
    return { resultsAsOf: sourceAsOf ?? previousCalendarDay(local), dateBasis: sourceAsOf ? "source" : "assumed-previous-day", timeZone };
}
export interface Tier {
    amount: number;
    originalCount: number;
    remaining: number;
    odds?: number;
}
export interface Raw {
    state: string;
    gameId: string;
    name: string;
    price: number;
    tiers: Tier[];
    overallOdds?: number;
    totalTickets?: number;
}
export function rawIssues(g: Raw): string[] {
    const issues: string[] = [];
    if (!g.gameId || !g.name)
        issues.push("Game identity unavailable");
    if (g.state === "ia")
        issues.push("Source adapter includes only prizes of $50 or more; complete-ladder EV unavailable");
    if (!Number.isFinite(g.price) || g.price <= 0)
        issues.push("Invalid ticket price");
    if (!Array.isArray(g.tiers) || !g.tiers.length)
        return [...issues, "Prize tiers unavailable"];
    for (const t of g.tiers) {
        if (!Number.isFinite(t.amount) || t.amount <= 0)
            issues.push("Prize value unavailable or non-cash tier unsupported");
        if (![t.remaining, t.originalCount].every(n => Number.isSafeInteger(n) && n >= 0))
            issues.push("Invalid prize counts");
        if (t.remaining > t.originalCount)
            issues.push("Unclaimed count exceeds original count; reprint/source correction needs review");
        if (t.odds !== undefined && (!Number.isFinite(t.odds) || t.odds < 1))
            issues.push("Invalid published odds");
    }
    if (new Set(g.tiers.map(t => t.amount)).size !== g.tiers.length)
        issues.push("Duplicate prize tiers need reconciliation");
    return [...new Set(issues)];
}
export interface Metrics {
    originalTickets: number;
    ticketsRemaining: number;
    fractionRemaining: number;
    evPerTicket: number;
    roi: number;
    remainingPrizeValue: number;
    topPrizesRemaining: number;
    topPrizeAmount: number;
}
export function computedIssues(g: Raw & {
    computed?: Metrics | null;
}): string[] {
    const issues = rawIssues(g), c = g.computed;
    if (!c || !Object.values(c).every(Number.isFinite))
        return [...issues, "Model estimate unavailable"];
    if (c.originalTickets <= 0)
        issues.push("Original ticket-count anchor unavailable");
    if (c.ticketsRemaining <= 0)
        issues.push("Estimated remaining ticket denominator unavailable");
    if (c.fractionRemaining <= 0 || c.fractionRemaining > 1)
        issues.push("Remaining fraction outside supported range");
    if (Array.isArray(g.tiers)) {
        const original = g.tiers.reduce((a, t) => a + t.originalCount, 0), remaining = g.tiers.reduce((a, t) => a + t.remaining, 0);
        const value = g.tiers.reduce((a, t) => a + t.amount * t.remaining, 0), top = [...g.tiers].sort((a, b) => b.amount - a.amount)[0];
        if (c.originalTickets < original)
            issues.push("Original tickets smaller than winning prizes");
        const anchors = g.tiers.filter(t => t.odds && t.originalCount > 0).map(t => t.odds! * t.originalCount);
        if (g.totalTickets !== undefined)
            anchors.push(g.totalTickets);
        if (g.overallOdds !== undefined)
            anchors.push(g.overallOdds * original);
        if (!anchors.length)
            issues.push("Original ticket-count anchor unavailable");
        if (anchors.some(n => !Number.isFinite(n) || n <= 0 || Math.abs(n - c.originalTickets) / c.originalTickets > 0.10))
            issues.push("Conflicting ticket-count anchors require source review");
        if (Math.abs(c.fractionRemaining - remaining / original) > 0.00011 || Math.abs(c.ticketsRemaining - Math.round(c.originalTickets * remaining / original)) > 1)
            issues.push("Inconsistent remaining-ticket model");
        if (Math.abs(c.remainingPrizeValue - value) > 1 || Math.abs(c.evPerTicket - value / c.ticketsRemaining) > 0.001 || c.topPrizeAmount !== top?.amount || c.topPrizesRemaining !== top?.remaining)
            issues.push("Inconsistent prize totals / EV");
        if (g.tiers.reduce((a, t) => a + t.amount * t.originalCount, 0) > c.originalTickets * g.price * 1.01)
            issues.push("Original prize pool exceeds ticket revenue");
    }
    if (c.ticketsRemaining < (g.tiers?.reduce((a, t) => a + t.remaining, 0) ?? 0))
        issues.push("Estimated tickets smaller than unclaimed winning prizes");
    if (c.roi < 0 || c.evPerTicket < 0 || Math.abs(c.roi * g.price - c.evPerTicket) > 0.01)
        issues.push("Inconsistent gross return / EV");
    return [...new Set(issues)];
}
export interface FeedStatus {
    generatedAt: string;
    states?: {
        state: string;
        ok: boolean;
        error?: string;
    }[];
}
export interface FeedHealth extends ReportingDate {
    state: string;
    importedAt: string;
    lastAttemptAt?: string;
    source: string;
    eligible: boolean;
    reasons: string[];
    correction?: string;
}
export function feedHealth(data: SnapshotDates & {
    source: string;
}, status: FeedStatus | null, now = Date.now()): FeedHealth {
    const reasons: string[] = SOURCE_PAUSES[data.state] ? [SOURCE_PAUSES[data.state]!] : [];
    let dates: ReportingDate;
    try {
        dates = reportingDate(data.generatedAt, data.state, data.sourceAsOf ?? (data.dateBasis === "source" ? data.resultsAsOf : undefined), data.timeZone);
    }
    catch {
        dates = { resultsAsOf: "Unavailable", dateBasis: "assumed-previous-day", timeZone: SOURCE_ZONES[data.state] ?? "UTC" };
        reasons.push("Import/source date invalid or unavailable");
    }
    const age = now - Date.parse(data.generatedAt);
    if (!Number.isFinite(age) || age < -300000)
        reasons.push("Import timestamp invalid or in the future");
    else if (age > 48 * 3600000)
        reasons.push("Retained snapshot is older than 48 hours");
    const latest = status && Date.parse(status.generatedAt) >= Date.parse(data.generatedAt) ? status.states?.find(s => s.state === data.state) : undefined;
    if (latest?.ok === false)
        reasons.push("Latest collection failed; retained snapshot: " + (latest.error ?? "see collection log"));
    if (validDate(dates.resultsAsOf) && Date.parse(calendarDay(new Date(now).toISOString(), dates.timeZone)) - Date.parse(dates.resultsAsOf) > 2 * 86400000)
        reasons.push("Results date is older than two calendar days");
    return { ...dates, state: data.state, source: data.source, importedAt: data.generatedAt, lastAttemptAt: latest ? status?.generatedAt : undefined, eligible: reasons.length === 0, reasons };
}
export function freshnessRange(feeds: FeedHealth[]): {
    oldest: string | null;
    newest: string | null;
} { const dates = feeds.filter(f => f.eligible).map(f => f.resultsAsOf).filter(validDate).sort(); return { oldest: dates[0] ?? null, newest: dates.at(-1) ?? null }; }
