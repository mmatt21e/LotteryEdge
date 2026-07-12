/** A single prize tier within a scratch-off game, as published by the lottery. */
export interface PrizeTier {
  /** Dollar value of the prize (e.g. 1000000). */
  amount: number;
  /** Published odds "1 in X" for this tier at print time (X). Optional — not every source lists it. */
  odds?: number;
  /** Original number of prizes at this tier when the game was printed. */
  originalCount: number;
  /** Prizes still unclaimed as of the scrape. */
  remaining: number;
}

/** Raw game data as scraped, before EV computation. */
export interface RawGame {
  state: string;
  gameId: string;
  name: string;
  /** Ticket price in dollars. */
  price: number;
  url?: string;
  tiers: PrizeTier[];
  /** Whole-game anchor for sources without per-tier odds (see ev.ts). */
  overallOdds?: number;
  totalTickets?: number;
}

/** A "lite" game for states that publish only top-prize / list data. */
export interface LiteGame {
  gameId: string;
  name: string;
  price: number;
  topPrize: string;
  topPrizeValue: number | null;
  closingSoon: boolean;
}

/** One state's scraper adapter. */
export interface Source {
  key: string; // "nc"
  name: string; // "North Carolina"
  tier: "A" | "B" | "C";
  kind: "full" | "lite";
  /** True if the adapter needs a headless browser (Playwright). */
  needsBrowser?: boolean;
  scrapeFull?: () => Promise<{ source: string; games: RawGame[] }>;
  scrapeLite?: () => Promise<{ source: string; games: LiteGame[] }>;
}

/** Derived expected-value statistics for a game. */
export interface ComputedStats {
  /** Estimated total tickets printed for the game. */
  originalTickets: number;
  /** Estimated fraction of the ticket pool still unsold (0..1). */
  fractionRemaining: number;
  /** Estimated tickets still unsold. */
  ticketsRemaining: number;
  /** Sum of (amount * remaining) across all tiers. */
  remainingPrizeValue: number;
  /** Expected prize value per remaining ticket, in dollars. */
  evPerTicket: number;
  /** evPerTicket / price. Above 1.0 is a theoretical edge. */
  roi: number;
  /** Count of the single highest-value tier's prizes still remaining. */
  topPrizesRemaining: number;
  /** Dollar value of the top tier. */
  topPrizeAmount: number;
}

export interface Game extends RawGame {
  computed: ComputedStats;
}

export interface ScrapeResult {
  generatedAt: string;
  state: string;
  source: string;
  gameCount: number;
  games: Game[];
}

export interface LiteResult {
  generatedAt: string;
  state: string;
  limited: true;
  source: string;
  gameCount: number;
  games: LiteGame[];
}
