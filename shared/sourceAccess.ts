/** Reviewed 2026-10-05. Remove a pause only after its stated blocker is resolved. */
export const SOURCE_PAUSES: Readonly<Record<string,string>> = {
  ar: "Automated access unavailable: official host returns HTTP 403 Cloudflare challenge; no bypass attempted.",
  ct: "Automated collection paused: ctlottery.com/terms-and-conditions explicitly prohibits automated scraping (Prohibited User Conduct, f).",
  ok: "Automated collection paused pending permission review: oklottery.com/terms-conditions section II requires written authorization to copy or reproduce service content; old JSON endpoint is retired.",
};
export function assertSourceAccess(state:string):void {
  const reason=SOURCE_PAUSES[state];
  if(reason) throw new Error(reason);
}
