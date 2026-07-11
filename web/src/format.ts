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
