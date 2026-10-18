/** Coverage is independent of whether a request completed or a date is recent. */
export interface FeedCoverage {
  sourceRecordCount: number;
  validatedCount: number;
  excludedCount: number;
  validation: "usable" | "partial" | "all-excluded" | "empty";
}
export interface ContentObservation {
  contentHash: string;
  unchangedRuns: number;
  /** First import in this observed identical-content sequence, not a provider date. */
  contentObservedSince: string;
}
export interface FeedDiagnostics {
  coverage?: FeedCoverage;
  observation?: ContentObservation;
}
export function feedCoverage(sourceRecordCount: number, validatedCount: number, excludedCount: number): FeedCoverage {
  return { sourceRecordCount, validatedCount, excludedCount,
    validation: sourceRecordCount === 0 ? "empty" : validatedCount === 0 ? "all-excluded" : excludedCount > 0 ? "partial" : "usable" };
}
export function collectionSummary(states: {ok: boolean; coverage?: FeedCoverage}[]) {
  return {
    collectedCount: states.filter(s => s.ok).length,
    usableCount: states.filter(s => s.ok && (s.coverage?.validatedCount ?? 0) > 0).length,
    zeroUsableCount: states.filter(s => s.ok && s.coverage?.validatedCount === 0).length,
  };
}
