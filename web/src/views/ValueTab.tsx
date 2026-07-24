import { useMemo, useState } from "react";
import type { GameChange } from "../changes.js";
import type { Game, History } from "../types.js";
import { effectiveRoi, endingSoon } from "../analytics.js";
import { lowConfRank, type SortKey } from "../components/primitives.js";
import { GameCard } from "../components/GameCard.js";
import { FilterControls } from "../components/FilterControls.js";
import { BudgetSheet } from "../sheets/BudgetSheet.js";

const SORT_OPTIONS = [
  { value: "roi", label: "Best value / $1" },
  { value: "topPrize", label: "Top prize size" },
  { value: "topLeft", label: "Top prizes left" },
  { value: "unsold", label: "% unsold" },
  { value: "price", label: "Price" },
];

export function ValueTab({
  games,
  history,
  demo,
  afterTax,
  onAfterTax,
  favSet,
  onToggleFav,
  changes,
  onSelect,
}: {
  games: Game[];
  history: History | null;
  demo: boolean;
  afterTax: boolean;
  onAfterTax: (v: boolean) => void;
  favSet: Set<string>;
  onToggleFav: (id: string) => void;
  changes: Map<string, GameChange>;
  onSelect: (g: Game) => void;
}) {
  const [price, setPrice] = useState<number | "all">("all");
  const [sort, setSort] = useState<SortKey>("roi");
  const [query, setQuery] = useState("");
  const [topOnly, setTopOnly] = useState(false);
  const [favOnly, setFavOnly] = useState(false);
  const [endingOnly, setEndingOnly] = useState(false);
  const [showBudget, setShowBudget] = useState(false);

  const prices = useMemo(() => {
    const set = new Set<number>();
    games.forEach((g) => set.add(g.price));
    return [...set].sort((a, b) => a - b);
  }, [games]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    let l = games.filter((g) => {
      if (price !== "all" && g.price !== price) return false;
      if (topOnly && g.computed.topPrizesRemaining <= 0) return false;
      if (favOnly && !favSet.has(g.gameId)) return false;
      if (endingOnly && !endingSoon(g)) return false;
      if (q && !g.name.toLowerCase().includes(q)) return false;
      return true;
    });
    l = [...l].sort((a, b) => {
      if (sort === "price") return a.price - b.price;
      if (sort === "topPrize") return b.computed.topPrizeAmount - a.computed.topPrizeAmount;
      if (sort === "topLeft") return b.computed.topPrizesRemaining - a.computed.topPrizesRemaining;
      if (sort === "unsold") return b.computed.fractionRemaining - a.computed.fractionRemaining;
      return lowConfRank(a) - lowConfRank(b) || effectiveRoi(b, afterTax) - effectiveRoi(a, afterTax);
    });
    return l;
  }, [games, price, sort, query, topOnly, favOnly, endingOnly, favSet, afterTax]);

  return (
    <>
      <FilterControls
        query={query}
        onQuery={setQuery}
        prices={prices}
        price={price}
        onPrice={setPrice}
        sortOptions={SORT_OPTIONS}
        sort={sort}
        onSort={(s) => setSort(s as SortKey)}
        sortNote={sort === "roi" ? "Low-confidence estimates rank last." : undefined}
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
              title="Estimate net after federal + state withholding (varies by state)"
            >
              After tax
            </button>
            <button className="chip budget-btn" onClick={() => setShowBudget(true)}>
              💡 Budget
            </button>
          </>
        }
      />

      {list.length === 0 && <div className="status">No games match.</div>}
      <ul className="list">
        {list.map((g) => (
          <GameCard
            key={g.gameId}
            game={g}
            history={history}
            demo={demo}
            afterTax={afterTax}
            isFav={favSet.has(g.gameId)}
            onToggleFav={() => onToggleFav(g.gameId)}
            change={changes.get(g.gameId)}
            onClick={() => onSelect(g)}
          />
        ))}
      </ul>

      {showBudget && (
        <BudgetSheet games={games} afterTax={afterTax} onClose={() => setShowBudget(false)} />
      )}
    </>
  );
}
