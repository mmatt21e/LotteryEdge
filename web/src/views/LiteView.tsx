import { useMemo, useState } from "react";
import { stateName } from "../states.js";
import type { LiteResult, LiteGame } from "../types.js";
import { FilterControls } from "../components/FilterControls.js";

const SORT_OPTIONS = [
  { value: "top", label: "Top prize" },
  { value: "price", label: "Price" },
];

export function LiteView({ data }: { data: LiteResult }) {
  const [price, setPrice] = useState<number | "all">("all");
  const [query, setQuery] = useState("");
  const [closingOnly, setClosingOnly] = useState(false);
  const [sort, setSort] = useState<"top" | "price">("top");

  const prices = useMemo(
    () => [...new Set(data.games.map((g) => g.price))].sort((a, b) => a - b),
    [data],
  );
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const l = data.games.filter((g) => {
      if (price !== "all" && g.price !== price) return false;
      if (closingOnly && !g.closingSoon) return false;
      if (q && !g.name.toLowerCase().includes(q)) return false;
      return true;
    });
    l.sort((a, b) =>
      sort === "price" ? a.price - b.price : (b.topPrizeValue ?? 0) - (a.topPrizeValue ?? 0),
    );
    return l;
  }, [data, price, query, closingOnly, sort]);

  return (
    <>
      <div className="demo-banner">
        <strong>{stateName(data.state)} — limited data.</strong> This state doesn’t publish
        per-prize “remaining” counts, so there’s no EV / net-per-$1 here — only each game’s{" "}
        <em>top prize</em> and a <strong>closing-soon</strong> flag.
      </div>

      <FilterControls
        query={query}
        onQuery={setQuery}
        prices={prices}
        price={price}
        onPrice={setPrice}
        sortOptions={SORT_OPTIONS}
        sort={sort}
        onSort={(s) => setSort(s as "top" | "price")}
        toggles={
          <button
            className={`chip ${closingOnly ? "chip-on" : ""}`}
            onClick={() => setClosingOnly((v) => !v)}
          >
            ⏳ Closing soon
          </button>
        }
      />

      {list.length === 0 && <div className="status">No games match.</div>}
      <ul className="list">
        {list.map((g: LiteGame) => (
          <li key={g.gameId} className="card lite-card">
            <div className="card-head">
              <span className="price-tag">${g.price}</span>
              <span className="game-name">{g.name}</span>
            </div>
            <div className="card-stats">
              <span className="lite-top">Top prize {g.topPrize || "—"}</span>
              {g.closingSoon && <span className="badge badge-warn">⏳ closing soon</span>}
              {g.url && (
                <a className="official lite-link" href={g.url} target="_blank" rel="noreferrer">
                  details ↗
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>

      <p className="disclaimer">
        Source: {data.source}. A full EV ranking (like NC) needs per-prize remaining counts, which
        this state doesn’t publish.
      </p>
    </>
  );
}
