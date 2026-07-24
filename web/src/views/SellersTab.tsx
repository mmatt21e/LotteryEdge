import { useMemo, useState } from "react";
import type { Game, History } from "../types.js";
import { int } from "../format.js";
import { computeVelocity, isoDaysAgo, todayIso } from "../analytics.js";
import { Chip, pressKeys } from "../components/primitives.js";

type Range = 7 | 14 | 30 | "all" | "custom";

export function SellersTab({
  games,
  history,
  demo,
  onSelect,
}: {
  games: Game[];
  history: History | null;
  demo: boolean;
  onSelect: (g: Game) => void;
}) {
  const [range, setRange] = useState<Range>(7);
  const [from, setFrom] = useState(isoDaysAgo(7));
  const [to, setTo] = useState(todayIso());

  const earliest = useMemo(() => {
    let min = todayIso();
    if (history) {
      for (const s of Object.values(history.series)) {
        const first = s.points[0];
        if (first && first.date < min) min = first.date;
      }
    }
    return min;
  }, [history]);

  const window = useMemo(() => {
    if (range === "custom") return { from, to };
    if (range === "all") return { from: earliest, to: todayIso() };
    return { from: isoDaysAgo(range), to: todayIso() };
  }, [range, from, to, earliest]);

  const byId = useMemo(() => new Map(games.map((g) => [g.gameId, g])), [games]);

  const ranked = useMemo(() => {
    if (!history) return [];
    return Object.entries(history.series)
      .map(([id, series]) => ({ id, series, v: computeVelocity(series, window.from, window.to) }))
      .filter((r) => r.v && r.v.sold > 0)
      .sort((a, b) => b.v!.sold - a.v!.sold);
  }, [history, window]);

  return (
    <>
      <div className="controls">
        <div className="chips" role="group" aria-label="Time window">
          {([7, 14, 30, "all", "custom"] as Range[]).map((r) => (
            <Chip key={String(r)} active={range === r} onClick={() => setRange(r)}>
              {r === "all" ? "All time" : r === "custom" ? "Custom" : `${r}d`}
            </Chip>
          ))}
        </div>
        {range === "custom" && (
          <div className="date-range">
            <label>
              From <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              To <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        )}
      </div>

      {ranked.length === 0 ? (
        <div className="status">
          Not enough history yet to measure sales. The tracker fills in as daily snapshots
          accumulate — check back in a few days.
        </div>
      ) : (
        <>
          <div className="sellers-caption">
            {demo && <span className="sample-pill">Sample</span>}
            Estimated tickets sold, {window.from} → {window.to}
          </div>
          <ul className="list">
            {ranked.map(({ id, v }, i) => {
              const g = byId.get(id);
              return (
                <li
                  key={id}
                  className="card seller"
                  role="button"
                  tabIndex={0}
                  onClick={() => g && onSelect(g)}
                  onKeyDown={pressKeys(() => g && onSelect(g))}
                >
                  <span className="rank">{i + 1}</span>
                  <div className="seller-main">
                    <div className="card-head">
                      <span className="price-tag">${g?.price ?? "?"}</span>
                      <span className="game-name">{v && (history!.series[id]?.name ?? id)}</span>
                    </div>
                    <div className="card-stats">
                      <span className="sold">{int(v!.sold)} sold</span>
                      <span>{int(v!.perDay)}/day</span>
                      <span>{v!.days}d span</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
