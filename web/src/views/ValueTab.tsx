import { useMemo, useState } from "react";
import type { GameChange } from "../changes.js";
import type { Game, History } from "../types.js";
import {
  effectiveRoi,
  endingSoon,
  prizeGoalOddsRank,
  remainingPrizesAtOrAbove,
  topOddsRank,
} from "../analytics.js";
import { lowConfRank, PRIZE_GOALS, type SortKey } from "../components/primitives.js";
import { GameCard } from "../components/GameCard.js";
import { FilterControls } from "../components/FilterControls.js";
import { BudgetSheet } from "../sheets/BudgetSheet.js";

const SORT_OPTIONS = [
  { value: "roi", label: "Best value / $1" },
  { value: "topPrize", label: "Top prize size" },
  { value: "topLeft", label: "Top prizes left" },
  { value: "topOdds", label: "Top-prize odds (best now)" },
  { value: "prizeGoalOdds", label: "Prize-goal odds (best now)" },
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
  const [prizeGoal, setPrizeGoal] = useState(0);
  const [showBudget, setShowBudget] = useState(false);
  const pickPrizeGoal = (minimum: number) => {
    setPrizeGoal(minimum);
    if (minimum > 0) setSort("prizeGoalOdds");
  };
  const pickSort = (next: SortKey) => {
    if (next === "prizeGoalOdds" && prizeGoal === 0) setPrizeGoal(100_000);
    setSort(next);
  };
  const resetFilters = () => {
    setQuery("");
    setPrice("all");
    setSort("roi");
    setTopOnly(false);
    setFavOnly(false);
    setEndingOnly(false);
    setPrizeGoal(0);
    onAfterTax(false);
  };

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
      if (prizeGoal > 0 && remainingPrizesAtOrAbove(g, prizeGoal) <= 0) return false;
      if (favOnly && !favSet.has(g.gameId)) return false;
      if (endingOnly && !endingSoon(g)) return false;
      if (q && !g.name.toLowerCase().includes(q)) return false;
      return true;
    });
    l = [...l].sort((a, b) => {
      if (sort === "price") return a.price - b.price;
      if (sort === "topPrize") return b.computed.topPrizeAmount - a.computed.topPrizeAmount;
      if (sort === "topLeft") return b.computed.topPrizesRemaining - a.computed.topPrizesRemaining;
      if (sort === "topOdds") return topOddsRank(a, b);
      if (sort === "prizeGoalOdds") return prizeGoalOddsRank(a, b, prizeGoal || 100_000);
      if (sort === "unsold") return b.computed.fractionRemaining - a.computed.fractionRemaining;
      return lowConfRank(a) - lowConfRank(b) || effectiveRoi(b, afterTax) - effectiveRoi(a, afterTax);
    });
    return l;
  }, [games, price, sort, query, topOnly, favOnly, endingOnly, prizeGoal, favSet, afterTax]);

  const prizeGoalLabel =
    PRIZE_GOALS.find((goal) => goal.min === (prizeGoal || 100_000))?.label ?? "$100k+";

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
        onSort={(s) => pickSort(s as SortKey)}
        sortNote={
          sort === "roi"
            ? "Low-confidence estimates rank last."
            : sort === "topOdds"
              ? "Best current shot at the top prize first — est. tickets left ÷ top prizes left."
              : sort === "prizeGoalOdds"
                ? `Best current shot at ${prizeGoalLabel} first — est. tickets left ÷ all qualifying prizes left.`
              : undefined
        }
        prizeGoal={{ value: prizeGoal, onChange: pickPrizeGoal }}
        activeToggleLabels={[
          ...(favOnly ? ["Favorites"] : []),
          ...(topOnly ? ["Top prize left"] : []),
          ...(endingOnly ? ["Ending soon"] : []),
          ...(afterTax ? ["After tax"] : []),
        ]}
        onReset={resetFilters}
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
            showTopOdds={sort === "topOdds"}
            prizeGoal={prizeGoal > 0 ? prizeGoal : undefined}
          />
        ))}
      </ul>

      {showBudget && (
        <BudgetSheet games={games} afterTax={afterTax} onClose={() => setShowBudget(false)} />
      )}
    </>
  );
}
