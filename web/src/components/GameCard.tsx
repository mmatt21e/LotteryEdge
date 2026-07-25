import { Sparkline } from "../Sparkline.js";
import type { GameChange } from "../changes.js";
import type { Game, History } from "../types.js";
import { usdCompact, pct, int, compact, netPerDollar, centsPerDollar } from "../format.js";
import {
  profitOdds,
  liveProfitOdds,
  confidence,
  pointNet,
  effectiveRoi,
  endingSoon,
  ticketsToTopPrize,
} from "../analytics.js";
import { roiColor, signColor, pressKeys, CONF_COLOR } from "./primitives.js";

export function GameCard({
  game,
  history,
  demo,
  afterTax,
  isFav,
  onToggleFav,
  change,
  onClick,
  badge,
  showTopOdds,
}: {
  game: Game;
  history: History | null;
  demo: boolean;
  afterTax: boolean;
  isFav: boolean;
  onToggleFav: () => void;
  change?: GameChange;
  onClick: () => void;
  badge?: string;
  /** Show the live 1-in-N odds of hitting the top prize (used when sorting by them). */
  showTopOdds?: boolean;
}) {
  const c = game.computed;
  const roi = effectiveRoi(game, afterTax);
  const width = Math.min(100, Math.max(4, roi * 100));
  const conf = confidence(c.fractionRemaining);
  const odds = liveProfitOdds(game) ?? profitOdds(game);
  const ending = endingSoon(game);
  const nets = (history?.series[game.gameId]?.points ?? []).map(pointNet);

  return (
    <li className="card" role="button" tabIndex={0} onClick={onClick} onKeyDown={pressKeys(onClick)}>
      <div className="card-head">
        <span className="price-tag">${game.price}</span>
        {badge && <span className="state-badge">{badge}</span>}
        <span className="game-name">{game.name}</span>
        <button
          className={`star ${isFav ? "star-on" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFav();
          }}
          aria-label={isFav ? "Unfavorite" : "Favorite"}
        >
          {isFav ? "★" : "☆"}
        </button>
      </div>
      {change && (
        <div className="change-row">
          {change.topClaimed > 0 && (
            <span className="badge badge-warn">
              {change.topClaimed} top prize{change.topClaimed > 1 ? "s" : ""} claimed
            </span>
          )}
          {Math.abs(change.netDelta) >= 0.005 && (
            <span className={`badge ${change.netDelta > 0 ? "badge-up" : "badge-down"}`}>
              {change.netDelta > 0 ? "▲ better value" : "▼ worse value"}
            </span>
          )}
          <span className="since">since last visit</span>
        </div>
      )}
      <div className="roi-row">
        <div className="roi-bar">
          <div className="roi-fill" style={{ width: `${width}%`, background: roiColor(roi) }} />
        </div>
        <span className="per-dollar" style={{ color: signColor(netPerDollar(roi)) }}>
          {centsPerDollar(netPerDollar(roi))}
          <span className="per-dollar-unit"> / $1{afterTax ? " (net of tax)" : ""}</span>
        </span>
      </div>
      <div className="card-stats">
        <span className="conf-dot" title={conf.reason}>
          <i style={{ background: CONF_COLOR[conf.level] }} /> {conf.level}
        </span>
        {ending && (
          <span className={`badge ${ending === "ending" ? "badge-warn" : "badge-down"}`}>
            ⏳ {ending === "ending" ? "ending" : "ending soon"}
          </span>
        )}
        <span>{odds ? `1 in ${int(odds)} to profit` : `${pct(roi, 0)} return`}</span>
        <span>
          Top {usdCompact(c.topPrizeAmount)} · {c.topPrizesRemaining} left
          {showTopOdds && ticketsToTopPrize(game) != null && (
            <strong className="top-odds"> · 1 in {compact(ticketsToTopPrize(game)!)} now</strong>
          )}
        </span>
        {nets.length >= 2 && (
          <span className="card-spark" title={demo ? "Sample trend" : "Net/$1 trend"}>
            <Sparkline values={nets} color={roiColor(roi)} width={64} height={18} dashed={demo} />
          </span>
        )}
      </div>
    </li>
  );
}
