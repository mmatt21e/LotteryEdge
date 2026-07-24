/**
 * Shared parsing helpers for state adapters. Most sources publish the same
 * three shapes — money/count strings, "1 in X" odds, and dollar labels — and
 * every adapter used to carry its own subtly-different copy of these.
 */

/** "$1,000,000" -> 1000000, "1,469,394" -> 1469394, "N/A"/missing -> NaN. */
export function num(s: string | null | undefined): number {
  if (!s) return NaN;
  const v = Number(s.replace(/[$,%\s]/g, ""));
  return Number.isFinite(v) ? v : NaN;
}

/**
 * FIRST number in a string: "2 of 4" -> 2, "$5.00" -> 5, "no digits" -> NaN.
 * Use this (never a strip-all-non-digits regex) when the field can contain
 * more than one number — stripping "2 of 4" yields 24.
 */
export function leadingNum(s: unknown): number {
  const m = /[\d,]+(?:\.\d+)?/.exec(String(s ?? ""));
  if (!m) return NaN;
  const v = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(v) ? v : NaN;
}

/** "1 in 4.13" / "1:4.13" / "1-in-4.13" (any prefix) -> 4.13; undefined if absent. */
export function parseOdds(s: string | null | undefined): number | undefined {
  if (!s) return undefined;
  const m = /1\s*(?:in|:|-in-)\s*([\d,]+(?:\.\d+)?)/i.exec(s);
  if (!m) return undefined;
  const v = Number(m[1]!.replace(/,/g, ""));
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

/** 25000 -> "$25,000" (top-prize labels in lite adapters). */
export const fmtDollars = (n: number): string => `$${n.toLocaleString("en-US")}`;
