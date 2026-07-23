import { useMemo, useState } from "react";
import { useAllScratchers } from "../useScratchers.js";
import { stateName } from "../states.js";
import type { Game } from "../types.js";
import { effectiveRoi, endingSoon } from "../analytics.js";
import { lowConfRank, type SortKey } from "../components/primitives.js";
import { GameCard } from "../components/GameCard.js";
import { FilterControls } from "../components/FilterControls.js";

const ALL_RENDER_CAP = 400;

const SORT_OPTIONS = [
  { value: "roi", label: "Best value / $1" },
  { value: "topPrize", label: "Top prize size" },
  { value: "topLeft", label: "Top prizes left" },
  { value: "unsold", label: "% unsold" },
  { value: "price", label: "Price" },
];

export function AllStatesView({
  all,
  stateFilter,
  onStateFilter,
  afterTax,
  onAfterTax,
  isFav,
  onToggleFav,
  onSelect,
}: {
  all: ReturnType<typeof useAllScratchers>;
  /** Quick-select state filter — owned by App so the state picker mirrors it. */
  stateFilter: string[];
  onStateFilter: (update: (prev: string[]) => string[]) => void;
  afterTax: boolean;
  onAfterTax: (v: boolean) => void;
  isFav: (g: Game) => boolean;
  onToggleFav: (g: Game) => void;
  onSelect: (g: Game) => void;
}) {
  const [price, setPrice] = useState<number | "all">("all");
  const [sort, setSort] = useState<SortKey>("roi");
  const [query, setQuery] = useState("");
  const states = useMemo(() => new Set(stateFilter), [stateFilter]);
  const [topOnly, setTopOnly] = useState(false);
  const [favOnly, setFavOnly] = useState(false);
  const [endingOnly, setEndingOnly] = useState(false);

  const prices = useMemo(() => {
    const set = new Set<number>();
    all.games.forEach((g) => set.add(g.price));
    return [...set].sort((a, b) => a - b);
  }, [all.games]);

  const loadedStates = useMemo(
    () => [...all.loaded].sort((a, b) => stateName(a).localeCompare(stateName(b))),
    [all.loaded],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const l = all.games.filter((g) => {
      if (states.size > 0 && !states.has(g.state)) return false;
      if (price !== "all" && g.price !== price) return false;
      if (topOnly && g.computed.topPrizesRemaining <= 0) return false;
      if (favOnly && !isFav(g)) return false;
      if (endingOnly && !endingSoon(g)) return false;
      if (q && !g.name.toLowerCase().includes(q)) return false;
      return true;
    });
    l.sort((a, b) => {
      if (sort === "price") return a.price - b.price;
      if (sort === "topPrize") return b.computed.topPrizeAmount - a.computed.topPrizeAmount;
      if (sort === "topLeft") return b.computed.topPrizesRemaining - a.computed.topPrizesRemaining;
      if (sort === "unsold") return b.computed.fractionRemaining - a.computed.fractionRemaining;
      return lowConfRank(a) - lowConfRank(b) || effectiveRoi(b, afterTax) - effectiveRoi(a, afterTax);
    });
    return l;
  }, [all.games, states, price, sort, query, topOnly, favOnly, endingOnly, isFav, afterTax]);

  const shown = filtered.slice(0, ALL_RENDER_CAP);
  const toggleState = (key: string) =>
    onStateFilter((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  if (all.loading && all.games.length === 0)
    return <div className="status">Loading all states…</div>;
  if (all.games.length === 0)
    return <div className="status">No state data published yet.</div>;

  return (
    <>
      <div className="demo-banner">
        <strong>All states combined.</strong> Every full-EV game from{" "}
        {all.loaded.length} states, ranked head-to-head by value. Lite states (top-prize only) and
        states not yet available are excluded.
        {all.failed.length > 0 && (
          <>
            {" "}
            <strong>
              {all.failed.length} full state{all.failed.length === 1 ? "" : "s"} had no data today
            </strong>{" "}
            ({all.failed.map((k) => k.toUpperCase()).join(", ")}).
          </>
        )}
      </div>

      <FilterControls
        query={query}
        onQuery={setQuery}
        searchPlaceholder="Search games across all states…"
        prices={prices}
        price={price}
        onPrice={setPrice}
        sortOptions={SORT_OPTIONS}
        sort={sort}
        onSort={(s) => setSort(s as SortKey)}
        sortNote={sort === "roi" ? "Low-confidence estimates rank last." : undefined}
        stateChips={{
          keys: loadedStates,
          active: states,
          onToggle: toggleState,
          onClear: () => onStateFilter(() => []),
        }}
        toggles={
          <>
            <button className={`chip ${favOnly ? "chip-on" : ""}`} onClick={() => setFavOnly((v) => !v)}>
              ★ Favorites
            </button>
            <button className={`chip ${topOnly ? "chip-on" : ""}`} onClick={() => setTopOnly((v) => !v)}>
              Top prize left
            </button>
            <button
              className={`chip ${endingOnly ? "chip-on" : ""}`}
              onClick={() => setEndingOnly((v) => !v)}
            >
              ⏳ Ending soon
            </button>
            <button
              className={`chip ${afterTax ? "chip-on" : ""}`}
              onClick={() => onAfterTax(!afterTax)}
              title="Estimate net after federal + state withholding"
            >
              After tax
            </button>
          </>
        }
      />

      <div className="sellers-caption">
        {filtered.length} game{filtered.length === 1 ? "" : "s"}
        {filtered.length > ALL_RENDER_CAP && ` · showing top ${ALL_RENDER_CAP} — filter to narrow`}
      </div>

      {shown.length === 0 && <div className="status">No games match.</div>}
      <ul className="list">
        {shown.map((g) => (
          <GameCard
            key={`${g.state}:${g.gameId}`}
            game={g}
            history={null}
            demo={false}
            afterTax={afterTax}
            isFav={isFav(g)}
            onToggleFav={() => onToggleFav(g)}
            onClick={() => onSelect(g)}
            badge={g.state.toUpperCase()}
          />
        ))}
      </ul>

      <p className="disclaimer">
        ROI uses <em>estimated</em> tickets remaining — good for ranking, not a promise of profit.
        Most games sit below break-even. Tax toggle uses a flat federal + state estimate.
      </p>
    </>
  );
}
