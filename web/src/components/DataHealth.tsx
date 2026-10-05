import type { AnyResult } from "../types.js";
import type { FeedHealth } from "../../../shared/quality.js";
import { relativeTime } from "../format.js";
export function FeedDates({ feed }: {
    feed: FeedHealth;
}) {
    return <div className="feed-dates">
 <strong>{feed.state.toUpperCase()}: {feed.eligible ? "Source meets freshness rules" : "Current comparison unavailable"}</strong>
 <div>{feed.dateBasis === "source" ? "Official results as of" : "Assumed reporting date"}: {feed.resultsAsOf} ({feed.timeZone})</div>
 <div>Imported: {feed.importedAt} ({relativeTime(feed.importedAt)})</div>
 {feed.lastAttemptAt && <div>Last attempted collection: {feed.lastAttemptAt}</div>}
 {feed.dateBasis !== "source" && <div>Previous local calendar day is assumed; the provider has not confirmed that results date.</div>}
 {feed.reasons.length > 0 && <p>{feed.reasons.join(". ")}. Historical facts are retained; rankings, model odds and change alerts are withheld.</p>}
 {feed.correction && <p>Versioned correction: {feed.correction}</p>}
 <a href={feed.source} target="_blank" rel="noreferrer">Official source</a>
 </div>;
}
export function DataHealth({ data }: {
    data: AnyResult;
}) {
    return <section className="data-health" aria-label="Source dates and data quality">
 {data.health && <FeedDates feed={data.health}/>}
 {!("limited" in data && data.limited) && <p>{data.games.length} validated estimates available. Excluded records have no supported current EV or model odds.</p>}
 {!!data.excluded?.length && <details><summary>{data.excluded.length} records excluded from rankings — reasons</summary><ul>{data.excluded.map((g, i) => <li key={`${g.gameId}-${i}`}><strong>{g.name} (#{g.gameId})</strong>: EV and model odds unavailable. {g.reason}</li>)}</ul></details>}
 </section>;
}
