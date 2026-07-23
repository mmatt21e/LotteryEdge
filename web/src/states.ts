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
  // VA's scrape needs a headless browser and is currently blocked by the site's
  // bot detection — no data file has ever been published. Listed here (instead
  // of as a selectable lite state) until data actually exists; move it back to
  // STATES when scripts/va-scrape.mjs starts landing scratchers-va.json.
  { name: "Virginia", reason: "Site blocks automated access — no data yet." },
  { name: "New York", reason: "Doesn't publish per-ticket prices in its open data." },
  { name: "Illinois", reason: "Site needs a real browser we can't automate reliably." },
  { name: "Tennessee", reason: "Site disallows automated access — respecting robots.txt." },
  { name: "Arizona", reason: "Site blocks automated requests." },
  { name: "Montana", reason: "Doesn't publish prizes-remaining counts." },
  { name: "North Dakota", reason: "No state scratch-off games (draw games only)." },
  { name: "Wyoming", reason: "No state scratch-off games (draw games only)." },
];

/**
 * Official state-lottery "find a retailer" locator pages (enter ZIP/city → the
 * licensed stores that sell that state's tickets). These list licensed
 * retailers, not per-game inventory — no state publishes which store stocks a
 * specific game. Verified reachable on each state's own official domain.
 */
export const RETAILERS: Record<string, string> = {
  ar: "https://www.myarkansaslottery.com/retailer-locator/index",
  ca: "https://www.calottery.com/en/where-to-play",
  co: "https://www.coloradolottery.com/en/retailers/",
  ct: "https://www.ctlottery.org/WhereToPlay/107262",
  de: "https://www.delottery.com/Where-to-Buy",
  fl: "https://floridalottery.com/where-to-play",
  ga: "https://www.galottery.com/en-us/player-zone/where-to-play.html",
  id: "https://www.idaholottery.com/pages/find-a-retailer",
  ia: "https://ialottery.com/Pages/AboutUs/FindARetailer.aspx",
  ks: "https://www.playonkansas.com/find-retailers",
  ky: "https://www.kylottery.com/apps/customer_service/find_retailer.html",
  la: "https://louisianalottery.com/where-to-play/",
  me: "https://www.mainelottery.com/players_info/where_to_buy.html",
  md: "https://rewards.mdlottery.com/retail/locator",
  ma: "https://www.masslottery.com/tools/location-finder",
  mi: "https://www.michiganlottery.com/resources/find-a-retailer",
  mn: "https://www.mnlottery.com/retailers/find-a-retailer",
  ms: "https://www.mslottery.com/players/locate-a-retailer/",
  mo: "https://www.molottery.com/where-to-play/where-to-play.jsp",
  ne: "https://nelottery.com/homeapp/retailers/search",
  nh: "https://www.nhlottery.com/find-retailer",
  nj: "https://www.njlottery.com/en-us/retailer/findretailer.html",
  nm: "https://www.nmlottery.com/retailers/",
  nc: "https://nclottery.com/wheretoplay",
  oh: "https://www.ohiolottery.com/retail-locations",
  ok: "https://www.lottery.ok.gov/retailers/find",
  or: "https://www.oregonlottery.org/retailer/where-to-play/",
  pa: "https://www.palottery.pa.gov/Mobile-App/Find-Retailers.aspx",
  ri: "https://www.rilot.com/en-us/player-zone/find-a-retailer.html",
  sc: "https://www.sceducationlottery.com/Retailers",
  sd: "https://lottery.sd.gov/locations/",
  tx: "https://www.texaslottery.com/opencms/Games/Scratch_Offs/Retailer_Locator.jsp",
  vt: "https://vtlottery.com/where-to-play",
  va: "https://www.valottery.com/aboutus/findaretailer",
  wa: "https://www.walottery.com/WhereToPlay/",
  dc: "https://dclottery.com/player-resources/where-to-play",
  wv: "https://wvlottery.com/find-retailers",
  wi: "https://wilottery.com/locate-retailers",
};

export const retailerUrl = (key: string): string | undefined => RETAILERS[key];

/** Sentinel key for the merged cross-state view. */
export const ALL_KEY = "all";

/** True for keys the app can actually show (catalog states + the merged view). */
export const isKnownState = (key: string): boolean =>
  key === ALL_KEY || STATES.some((s) => s.key === key);

export const stateName = (key: string): string =>
  key === ALL_KEY ? "All states" : (STATES.find((s) => s.key === key)?.name ?? key.toUpperCase());

/** Full-EV state keys, in picker order — the states the combined view merges. */
export const fullStateKeys = (): string[] =>
  STATES.filter((s) => s.tier === "full").map((s) => s.key);

export const isLiteState = (key: string): boolean =>
  STATES.find((s) => s.key === key)?.tier === "lite";
