/** Nebraska reporting dates; generatedAt remains the actual successful import time. */
export function neReportingDate(importedAt: string, sourceAsOf?: string): {
  sourceAsOf?: string;
  resultsAsOf: string;
  dateBasis: "source" | "assumed-previous-day";
  timeZone: string;
} {
  const instant = new Date(importedAt);
  if (!Number.isFinite(instant.getTime())) throw new Error("NE invalid import timestamp");
  const timeZone = "America/Chicago";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(instant);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  if (sourceAsOf !== undefined) {
    const date = new Date(sourceAsOf + "T12:00:00Z");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceAsOf) ||
        !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== sourceAsOf || sourceAsOf > today) {
      throw new Error("NE invalid or future official results date");
    }
    return { sourceAsOf, resultsAsOf: sourceAsOf, dateBasis: "source", timeZone };
  }
  // Subtract a calendar date after locating the publisher's local date, not 24h from the import instant.
  const previous = new Date(today + "T12:00:00Z");
  previous.setUTCDate(previous.getUTCDate() - 1);
  return { resultsAsOf: previous.toISOString().slice(0, 10), dateBasis: "assumed-previous-day", timeZone };
}
