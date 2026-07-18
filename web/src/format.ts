export const usd = (n: number): string =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const usd2 = (n: number): string =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

/** Compact dollars: 2000000 -> "$2M", 25000 -> "$25K". */
export const usdCompact = (n: number): string =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  });

export const pct = (frac: number, dp = 0): string => `${(frac * 100).toFixed(dp)}%`;

export const int = (n: number): string => Math.round(n).toLocaleString("en-US");

/** Compact plain number: 1535558 -> "1.5M", 413298 -> "413K", 397 -> "397". */
export const compact = (n: number): string =>
  Math.round(n).toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** Net expected win/loss per $1 wagered. roi 0.933 -> -0.067 (a 6.7¢ loss). */
export const netPerDollar = (roi: number): number => roi - 1;

/** Format a per-dollar net as signed cents: -0.067 -> "−6.7¢", 0.03 -> "+3.0¢". */
export function centsPerDollar(net: number): string {
  const cents = net * 100;
  const sign = cents > 0 ? "+" : cents < 0 ? "−" : "";
  return `${sign}${Math.abs(cents).toFixed(1)}¢`;
}

/** "Jul 16" from a date-only "YYYY-MM-DD" (parsed as local to avoid TZ shift). */
export function shortDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Absolute local date+time: "Jul 16, 6:12 AM" from an ISO timestamp. */
export function shortDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "3 hours ago", "2 days ago" from an ISO timestamp. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const secs = Math.max(0, Math.round((now - then) / 1000));
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, s] of units) {
    if (secs >= s) return rtf.format(-Math.round(secs / s), unit);
  }
  return "just now";
}
