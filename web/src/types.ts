// Mirrors the scraper's output shape (see ../../src/types.ts).

export interface PrizeTier {
  amount: number;
  odds?: number;
  originalCount: number;
  remaining: number;
}

export interface ComputedStats {
  originalTickets: number;
  fractionRemaining: number;
  ticketsRemaining: number;
  remainingPrizeValue: number;
  evPerTicket: number;
  roi: number;
  topPrizesRemaining: number;
  topPrizeAmount: number;
}

export interface Game {
  state: string;
  gameId: string;
  name: string;
  price: number;
  url?: string;
  overallOdds?: number; // "1 in X" to win any prize (present for anchor-based states)
  totalTickets?: number; // stated original print run, when the source gives it
  tiers: PrizeTier[];
  computed: ComputedStats;
}

export interface ScrapeResult {
  generatedAt: string;
  state: string;
  source: string;
  gameCount: number;
  games: Game[];
}

export interface TierPoint {
  amount: number;
  remaining: number;
}

export interface HistoryPoint {
  date: string;
  ticketsRemaining: number;
  roi: number;
  topPrizesRemaining: number;
  fractionRemaining: number;
  remainingPrizeValue: number;
  tiers?: TierPoint[]; // per-tier remaining, only on recent points
}

export interface GameSeries {
  name: string;
  price: number;
  points: HistoryPoint[];
}

export interface History {
  state: string;
  updatedAt: string;
  series: Record<string, GameSeries>;
}

/** "Lite" game — no per-tier prize data is public, so no EV. */
export interface LiteGame {
  gameId: string;
  name: string;
  price: number;
  topPrize: string;
  topPrizeValue: number | null;
  closingSoon: boolean;
  url?: string;
}

export interface LiteResult {
  generatedAt: string;
  state: string;
  limited: true;
  source: string;
  gameCount: number;
  games: LiteGame[];
}

export type AnyResult = ScrapeResult | LiteResult;
export const isLimited = (r: AnyResult | null): r is LiteResult => !!r && (r as LiteResult).limited === true;
