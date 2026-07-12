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
  state: "nc" | "va";
  gameId: string;
  name: string;
  price: number;
  url?: string;
  tiers: PrizeTier[];
  computed: ComputedStats;
}

export interface ScrapeResult {
  generatedAt: string;
  state: "nc" | "va";
  source: string;
  gameCount: number;
  games: Game[];
}

export interface HistoryPoint {
  date: string;
  ticketsRemaining: number;
  roi: number;
  topPrizesRemaining: number;
  fractionRemaining: number;
  remainingPrizeValue: number;
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

/** VA "lite" game — no per-tier prize data is public, so no EV. */
export interface LiteGame {
  gameId: string;
  name: string;
  price: number;
  topPrize: string;
  topPrizeValue: number | null;
  closingSoon: boolean;
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
