import { useMemo, useState } from "react";
import { FullPage } from "../Sheet.js";
import type { Game } from "../types.js";
import { pct } from "../format.js";
import { recommendForBudget } from "../analytics.js";
import { signColor } from "../components/primitives.js";

export function BudgetSheet({
  games,
  afterTax,
  onClose,
}: {
  games: Game[];
  afterTax: boolean;
  onClose: () => void;
}) {
  const [budget, setBudget] = useState(40);
  const picks = useMemo(
    () => recommendForBudget(games, budget, afterTax),
    [games, budget, afterTax],
  );
  return (
    <FullPage
      label="Budget helper"
      title="Budget helper"
      subtitle="Find the strongest current value within a spending limit"
      onClose={onClose}
    >
        <label className="budget-input">
          I want to spend
          <span>
            $
            <input
              type="number"
              min={1}
              step={1}
              value={budget}
              onChange={(e) => setBudget(Math.max(1, Number(e.target.value) || 0))}
            />
          </span>
        </label>
        <p className="budget-hint">
          Best current value{afterTax ? " (after tax)" : ""} for your budget:
        </p>
        <ul className="list">
          {picks.map(({ game, count, spend, expectedNet, roi }) => (
            <li key={game.gameId} className="card budget-pick">
              <div className="card-head">
                <span className="price-tag">${game.price}</span>
                <span className="game-name">{game.name}</span>
              </div>
              <div className="card-stats">
                <span className="sold">
                  {count} ticket{count > 1 ? "s" : ""} (${spend})
                </span>
                <span style={{ color: signColor(expectedNet) }}>
                  expected {expectedNet >= 0 ? "+" : "−"}${Math.abs(expectedNet).toFixed(2)}
                </span>
                <span>{pct(roi, 0)} return</span>
              </div>
            </li>
          ))}
        </ul>
        <p className="disclaimer">
          “Expected” is an average over the game’s remaining tickets — any single purchase varies
          wildly. Almost every option loses money on average.
        </p>
    </FullPage>
  );
}
