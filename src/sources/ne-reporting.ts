import { reportingDate } from "../../shared/quality.js";
/** Compatibility entry point for the focused Nebraska validator. */
export function neReportingDate(importedAt:string,sourceAsOf?:string) {
  return {...reportingDate(importedAt,"ne",sourceAsOf),...(sourceAsOf ? {sourceAsOf} : {})};
}
