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
