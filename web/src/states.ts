/**
 * The state catalog that drives the picker.
 *
 *  - `full`  : full EV ranking (prizes-remaining + odds/total-tickets anchor).
 *  - `lite`  : top-prize list + closing-soon flag only (state hides remaining).
 *  - `soon`  : has a lottery but we can't publish data yet — shown greyed with
 *              a plain-language reason so the list feels complete, not broken.
 */
export type StateTier = "full" | "lite";

export interface StateInfo {
  key: string;
  name: string;
  tier: StateTier;
}

export interface UnavailableState {
  name: string;
  reason: string;
}

/** Scrapeable states, alphabetical. Full = EV; lite = top-prize list only. */
export const STATES: StateInfo[] = [
  { key: "ar", name: "Arkansas", tier: "full" },
  { key: "ca", name: "California", tier: "full" },
  { key: "co", name: "Colorado", tier: "lite" },
  { key: "ct", name: "Connecticut", tier: "full" },
  { key: "de", name: "Delaware", tier: "lite" },
  { key: "fl", name: "Florida", tier: "full" },
  { key: "ga", name: "Georgia", tier: "lite" },
  { key: "id", name: "Idaho", tier: "full" },
  { key: "ia", name: "Iowa", tier: "full" },
  { key: "ks", name: "Kansas", tier: "lite" },
  { key: "ky", name: "Kentucky", tier: "full" },
  { key: "la", name: "Louisiana", tier: "full" },
  { key: "me", name: "Maine", tier: "lite" },
  { key: "md", name: "Maryland", tier: "full" },
  { key: "ma", name: "Massachusetts", tier: "full" },
  { key: "mi", name: "Michigan", tier: "full" },
  { key: "mn", name: "Minnesota", tier: "lite" },
  { key: "ms", name: "Mississippi", tier: "full" },
  { key: "mo", name: "Missouri", tier: "full" },
  { key: "ne", name: "Nebraska", tier: "lite" },
  { key: "nh", name: "New Hampshire", tier: "full" },
  { key: "nj", name: "New Jersey", tier: "lite" },
  { key: "nm", name: "New Mexico", tier: "lite" },
  { key: "nc", name: "North Carolina", tier: "full" },
  { key: "oh", name: "Ohio", tier: "full" },
  { key: "ok", name: "Oklahoma", tier: "full" },
  { key: "or", name: "Oregon", tier: "lite" },
  { key: "pa", name: "Pennsylvania", tier: "lite" },
  { key: "ri", name: "Rhode Island", tier: "full" },
  { key: "sc", name: "South Carolina", tier: "full" },
  { key: "sd", name: "South Dakota", tier: "lite" },
  { key: "tx", name: "Texas", tier: "full" },
  { key: "vt", name: "Vermont", tier: "lite" },
  { key: "va", name: "Virginia", tier: "lite" },
  { key: "wa", name: "Washington", tier: "full" },
  { key: "dc", name: "Washington DC", tier: "lite" },
  { key: "wv", name: "West Virginia", tier: "full" },
  { key: "wi", name: "Wisconsin", tier: "lite" },
];

/**
 * States with a lottery we can't rank yet, with an honest reason. Shown greyed
 * in the picker so its absence reads as "known & explained", not "forgotten".
 */
export const UNAVAILABLE: UnavailableState[] = [
  { name: "New York", reason: "Doesn't publish per-ticket prices in its open data." },
  { name: "Illinois", reason: "Site needs a real browser we can't automate reliably." },
  { name: "Tennessee", reason: "Site disallows automated access — respecting robots.txt." },
  { name: "Arizona", reason: "Site blocks automated requests." },
  { name: "Montana", reason: "Doesn't publish prizes-remaining counts." },
  { name: "North Dakota", reason: "No state scratch-off games (draw games only)." },
  { name: "Wyoming", reason: "No state scratch-off games (draw games only)." },
];

/** Sentinel key for the merged cross-state view. */
export const ALL_KEY = "all";

export const stateName = (key: string): string =>
  key === ALL_KEY ? "All states" : (STATES.find((s) => s.key === key)?.name ?? key.toUpperCase());

/** Full-EV state keys, in picker order — the states the combined view merges. */
export const fullStateKeys = (): string[] =>
  STATES.filter((s) => s.tier === "full").map((s) => s.key);

export const isLiteState = (key: string): boolean =>
  STATES.find((s) => s.key === key)?.tier === "lite";
