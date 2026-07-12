import { useMemo, useState } from "react";
import { useScratchers } from "./useScratchers.js";
import { Sparkline } from "./Sparkline.js";
import { buildDemoHistory, distinctDates } from "./demo.js";
import type { Game, History } from "./types.js";
import { usd, usd2, usdCompact, pct, int, relativeTime, netPerDollar, centsPerDollar } from "./format.js";
import {
  profitOdds,
  confidence,
  computeVelocity,
  isoDaysAgo,
  todayIso,
  trendDirection,
  pointNet,
  type ConfidenceLevel,
} from "./analytics.js";

type SortKey = "roi" | "topPrize" | "price";
type Tab = "value" | "sellers";

export default function App() {
  const { data, history, loading, error, refresh } = useScratchers("nc");
  const [tab, setTab] = useState<Tab>("value");
  const [selected, setSelected] = useState<Game | null>(null);

  // With ≤1 real day of history, trends/velocity have nothing to show, so we
  // fall back to clearly-labeled SAMPLE data generated from today's snapshot.
  const isDemo = distinctDates(history) <= 1;
  const effHistory = useMemo(
    () => (isDemo ? buildDemoHistory(data?.games ?? []) : history),
    [isDemo, data, history],
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark">◆</span> LotteryEdge
        </div>
        <button className="refresh" onClick={refresh} disabled={loading} aria-label="Refresh">
          <span className={loading ? "spin" : ""}>↻</span>
        </button>
      </header>

      <div className="meta">
        <span className="state-pill">NC</span>
        {data && (
          <span className="freshness">
            {data.gameCount} games · updated {relativeTime(data.generatedAt)}
          </span>
        )}
      </div>

      <div className="tabs" role="tablist">
        <button className={`tab ${tab === "value" ? "tab-on" : ""}`} onClick={() => setTab("value")}>
          Best value
        </button>
        <button
          className={`tab ${tab === "sellers" ? "tab-on" : ""}`}
          onClick={() => setTab("sellers")}
        >
          Hot sellers
        </button>
      </div>

      {isDemo && data && (
        <div className="demo-banner">
          <strong>Sample data</strong> — trend lines and “Hot sellers” below use{" "}
          <em>illustrative</em> history until 2+ daily updates are collected. Prices, odds, EV and
          net/$1 are real.
        </div>
      )}

      {loading && !data && <div className="status">Loading…</div>}
      {error && !data && (
        <div className="status error">
          Couldn’t load data ({error}). Pull to refresh once the scraper has published data.
        </div>
      )}

      {data &&
        (tab === "value" ? (
          <ValueTab games={data.games} history={effHistory} demo={isDemo} onSelect={setSelected} />
        ) : (
          <SellersTab games={data.games} history={effHistory} demo={isDemo} onSelect={setSelected} />
        ))}

      <p className="disclaimer">
        ROI uses <em>estimated</em> tickets remaining — good for ranking, not a promise of profit.
        Most games sit below break-even.
      </p>

      {selected && (
        <Detail
          game={selected}
          history={effHistory}
          demo={isDemo}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------- Best value ------------------------------- */

function ValueTab({
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
  const [price, setPrice] = useState<number | "all">("all");
  const [sort, setSort] = useState<SortKey>("roi");

  const prices = useMemo(() => {
    const set = new Set<number>();
    games.forEach((g) => set.add(g.price));
    return [...set].sort((a, b) => a - b);
  }, [games]);

  const list = useMemo(() => {
    let l = price === "all" ? games : games.filter((g) => g.price === price);
    l = [...l].sort((a, b) => {
      if (sort === "price") return a.price - b.price;
      if (sort === "topPrize") return b.computed.topPrizeAmount - a.computed.topPrizeAmount;
      return b.computed.roi - a.computed.roi;
    });
    return l;
  }, [games, price, sort]);

  return (
    <>
      <div className="controls">
        <div className="chips" role="group" aria-label="Filter by price">
          <Chip active={price === "all"} onClick={() => setPrice("all")}>
            All
          </Chip>
          {prices.map((p) => (
            <Chip key={p} active={price === p} onClick={() => setPrice(p)}>
              ${p}
            </Chip>
          ))}
        </div>
        <div className="sort">
          <label>
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="roi">Best value / $1</option>
              <option value="topPrize">Top prize</option>
              <option value="price">Price</option>
            </select>
          </label>
        </div>
      </div>

      <ul className="list">
        {list.map((g) => (
          <GameCard
            key={g.gameId}
            game={g}
            history={history}
            demo={demo}
            onClick={() => onSelect(g)}
          />
        ))}
      </ul>
    </>
  );
}

function roiColor(roi: number): string {
  if (roi >= 0.9) return "#3ddc97";
  if (roi >= 0.8) return "#a3d977";
  if (roi >= 0.7) return "#f5c451";
  return "#e08a5b";
}

const CONF_COLOR: Record<ConfidenceLevel, string> = {
  high: "#3ddc97",
  medium: "#f5c451",
  low: "#e08a5b",
};

function GameCard({
  game,
  history,
  demo,
  onClick,
}: {
  game: Game;
  history: History | null;
  demo: boolean;
  onClick: () => void;
}) {
  const c = game.computed;
  const width = Math.min(100, Math.max(4, c.roi * 100));
  const conf = confidence(c.fractionRemaining);
  const odds = profitOdds(game);
  const nets = (history?.series[game.gameId]?.points ?? []).map(pointNet);

  return (
    <li className="card" onClick={onClick}>
      <div className="card-head">
        <span className="price-tag">${game.price}</span>
        <span className="game-name">{game.name}</span>
      </div>
      <div className="roi-row">
        <div className="roi-bar">
          <div className="roi-fill" style={{ width: `${width}%`, background: roiColor(c.roi) }} />
        </div>
        <span className="per-dollar" style={{ color: roiColor(c.roi) }}>
          {centsPerDollar(netPerDollar(c.roi))}
          <span className="per-dollar-unit"> / $1</span>
        </span>
      </div>
      <div className="card-stats">
        <span className="conf-dot" title={conf.reason}>
          <i style={{ background: CONF_COLOR[conf.level] }} /> {conf.level}
        </span>
        <span>{odds ? `1 in ${int(odds)} to profit` : `${pct(c.roi, 0)} return`}</span>
        <span>Top {usdCompact(c.topPrizeAmount)} · {c.topPrizesRemaining} left</span>
        {nets.length >= 2 && (
          <span className="card-spark" title={demo ? "Sample trend" : "Net/$1 trend"}>
            <Sparkline values={nets} color={roiColor(c.roi)} width={64} height={18} dashed={demo} />
          </span>
        )}
      </div>
    </li>
  );
}

/* ------------------------------- Hot sellers ------------------------------ */

type Range = 7 | 14 | 30 | "all" | "custom";

function SellersTab({
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
                  onClick={() => g && onSelect(g)}
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

/* --------------------------------- Detail --------------------------------- */

function Detail({
  game,
  history,
  demo,
  onClose,
}: {
  game: Game;
  history: History | null;
  demo: boolean;
  onClose: () => void;
}) {
  const c = game.computed;
  const net = netPerDollar(c.roi);
  const conf = confidence(c.fractionRemaining);
  const odds = profitOdds(game);
  const points = history?.series[game.gameId]?.points ?? [];
  const nets = points.map(pointNet);
  const dir = trendDirection(nets);
  const tiers = [...game.tiers].sort((a, b) => b.amount - a.amount);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <div>
            <div className="sheet-title">{game.name}</div>
            <div className="sheet-sub">
              ${game.price} · game #{game.gameId}
            </div>
          </div>
          <button className="close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="kpis">
          <Kpi label="Net / $1 spent" value={centsPerDollar(net)} accent={roiColor(c.roi)} />
          <Kpi label="Return / $1" value={usd2(c.roi)} />
          <Kpi
            label="Odds to profit"
            value={odds ? `1 in ${int(odds)}` : "—"}
          />
          <Kpi label="EV / ticket" value={usd2(c.evPerTicket)} />
          <Kpi label="Tickets left" value={int(c.ticketsRemaining)} />
          <Kpi label="Prize $ left" value={usdCompact(c.remainingPrizeValue)} />
        </div>

        <div className="trend">
          <div className="trend-head">
            <span>Net / $1 trend {demo && <span className="sample-pill">Sample</span>}</span>
            <span className="trend-dir" style={{ color: dirColor(dir) }}>
              {dirLabel(dir)}
            </span>
          </div>
          {nets.length >= 2 ? (
            <Sparkline values={nets} color={roiColor(c.roi)} width={320} height={54} dashed={demo} />
          ) : (
            <div className="trend-empty">
              Trend builds as daily snapshots accumulate — check back soon.
            </div>
          )}
        </div>

        <div className="conf-line">
          <i style={{ background: CONF_COLOR[conf.level] }} />
          <span>
            <strong>{conf.level} confidence</strong> — {conf.reason}
          </span>
        </div>

        <p className="plain">
          For every <strong>$1</strong> spent, expect about <strong>{usd2(c.roi)}</strong> back — a
          net of <strong style={{ color: roiColor(c.roi) }}>{centsPerDollar(net)}</strong> per dollar.
          {odds && (
            <>
              {" "}
              Chance of winning more than the ${game.price} ticket:{" "}
              <strong>1 in {int(odds)}</strong>.
            </>
          )}
        </p>

        <table className="tiers">
          <thead>
            <tr>
              <th>Prize</th>
              <th>Odds 1 in</th>
              <th>Total</th>
              <th>Left</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((t, i) => (
              <tr key={i}>
                <td>{usd(t.amount)}</td>
                <td>{t.odds ? int(t.odds) : "—"}</td>
                <td>{int(t.originalCount)}</td>
                <td className={t.remaining === 0 ? "gone" : ""}>{int(t.remaining)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {game.url && (
          <a className="official" href={game.url} target="_blank" rel="noreferrer">
            View official game page ↗
          </a>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- primitives ------------------------------- */

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button className={`chip ${active ? "chip-on" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-val" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

const dirColor = (d: -1 | 0 | 1) => (d > 0 ? "#3ddc97" : d < 0 ? "#e08a5b" : "#9aa4c2");
const dirLabel = (d: -1 | 0 | 1) => (d > 0 ? "improving ↗" : d < 0 ? "declining ↘" : "flat →");
