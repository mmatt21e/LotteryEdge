import { useMemo, useState } from "react";
import type { WinnersResult } from "../types.js";
import { aggregateRetailers, sortRetailers, type RetailerSort } from "../retailers.js";
import { usdCompact, int, shortDay } from "../format.js";

const SORT_OPTIONS: { value: RetailerSort; label: string }[] = [
  { value: "wins", label: "Most winners" },
  { value: "total", label: "Total $ won" },
  { value: "biggest", label: "Biggest win" },
  { value: "recent", label: "Most recent" },
];

/**
 * Retailers ranked by publicly posted winners — a where-do-winners-get-sold
 * signal for hunting down games that are hard to find on shelves. High-volume
 * stores surface because volume produces (and posts) more winners.
 */
export function RetailersView({
  winners,
  stateName,
}: {
  winners: WinnersResult | null;
  stateName: string;
}) {
  const [sort, setSort] = useState<RetailerSort>("wins");
  const [query, setQuery] = useState("");
  const [scratchOnly, setScratchOnly] = useState(false);

  // The scratch-only chip only makes sense when the source labels game types.
  const hasFlags = useMemo(
    () => (winners?.winners ?? []).some((w) => w.scratch !== undefined),
    [winners],
  );

  const list = useMemo(() => {
    if (!winners) return [];
    const records = winners.winners.filter((w) => !scratchOnly || w.scratch === true);
    const q = query.trim().toLowerCase();
    const ranked = sortRetailers(aggregateRetailers(records), sort);
    if (!q) return ranked;
    return ranked.filter(
      (r) =>
        r.retailer.toLowerCase().includes(q) ||
        (r.city ?? "").toLowerCase().includes(q) ||
        r.games.some((g) => g.toLowerCase().includes(q)),
    );
  }, [winners, sort, query, scratchOnly]);

  if (!winners) {
    return (
      <div className="status">
        {stateName} doesn’t have a posted-winners feed here yet. Winner-based retailer stats
        appear for states whose lottery publishes recent winners with the selling store.
      </div>
    );
  }

  return (
    <>
      <div className="demo-banner">
        <strong>Where winners were sold.</strong> Retailers ranked by winners the {stateName}{" "}
        lottery <em>chose to post online</em> — a visibility signal that often tracks sales
        volume (useful for finding hard-to-stock games), not a statement of odds. Small wins
        usually go unposted.
      </div>

      <div className="controls">
        <input
          className="search"
          type="search"
          placeholder="Search retailers, cities, games…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="control-row">
          <div className="sort">
            <label>
              Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as RetailerSort)}>
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {hasFlags && (
            <div className="toggles">
              <button
                className={`chip ${scratchOnly ? "chip-on" : ""}`}
                onClick={() => setScratchOnly((v) => !v)}
              >
                Scratch-offs only
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="sellers-caption">
        {list.length} retailer{list.length === 1 ? "" : "s"} · {winners.count} posted winner
        {winners.count === 1 ? "" : "s"} tracked
      </div>

      {list.length === 0 && <div className="status">No retailers match.</div>}
      <ul className="list">
        {list.map((r, i) => (
          <li key={r.key} className="card seller">
            <span className="rank">{i + 1}</span>
            <div className="seller-main">
              <div className="card-head">
                <span className="game-name">{r.retailer}</span>
              </div>
              <div className="card-stats">
                {r.city && <span className="ret-city">📍 {r.city}</span>}
                <span className="sold">{int(r.wins)} winner{r.wins === 1 ? "" : "s"}</span>
                <span>{usdCompact(r.totalPrize)} total</span>
                <span>top {usdCompact(r.maxPrize)}</span>
                {r.lastDate && <span>last {shortDay(r.lastDate)}</span>}
              </div>
              {r.games.length > 0 && (
                <div className="ret-games">
                  {r.games.slice(0, 3).join(" · ")}
                  {r.games.length > 3 ? ` · +${r.games.length - 3} more` : ""}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      <p className="disclaimer">
        Winners are shown only if the lottery posted them online; unposted wins are invisible
        here. A store with many posted winners usually just sells a lot of tickets.
      </p>
    </>
  );
}
