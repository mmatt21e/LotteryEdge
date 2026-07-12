import { useMemo, useState } from "react";
import { useScratchers } from "./useScratchers.js";
import type { Game } from "./types.js";
import {
  usd,
  usd2,
  usdCompact,
  pct,
  int,
  relativeTime,
  netPerDollar,
  centsPerDollar,
} from "./format.js";

type SortKey = "roi" | "topPrize" | "price";

export default function App() {
  const { data, loading, error, refresh } = useScratchers("nc");
  const [price, setPrice] = useState<number | "all">("all");
  const [sort, setSort] = useState<SortKey>("roi");
  const [selected, setSelected] = useState<Game | null>(null);

  const prices = useMemo(() => {
    const set = new Set<number>();
    data?.games.forEach((g) => set.add(g.price));
    return [...set].sort((a, b) => a - b);
  }, [data]);

  const games = useMemo(() => {
    let list = data?.games ?? [];
    if (price !== "all") list = list.filter((g) => g.price === price);
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === "price") return a.price - b.price;
      if (sort === "topPrize") return b.computed.topPrizeAmount - a.computed.topPrizeAmount;
      return b.computed.roi - a.computed.roi;
    });
    return sorted;
  }, [data, price, sort]);

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
              <option value="roi">Best ROI</option>
              <option value="topPrize">Top prize</option>
              <option value="price">Price</option>
            </select>
          </label>
        </div>
      </div>

      {loading && !data && <div className="status">Loading…</div>}
      {error && !data && (
        <div className="status error">
          Couldn’t load data ({error}). Pull to refresh once the scraper has published data.
        </div>
      )}

      <ul className="list">
        {games.map((g) => (
          <GameCard key={g.gameId} game={g} onClick={() => setSelected(g)} />
        ))}
      </ul>

      <p className="disclaimer">
        ROI uses <em>estimated</em> tickets remaining — good for ranking, not a promise of profit.
        Most games sit below break-even.
      </p>

      {selected && <Detail game={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

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

/** ROI is capped at 1.0 for the bar width; color scales green→amber→red. */
function roiColor(roi: number): string {
  if (roi >= 0.9) return "#3ddc97";
  if (roi >= 0.8) return "#a3d977";
  if (roi >= 0.7) return "#f5c451";
  return "#e08a5b";
}

function GameCard({ game, onClick }: { game: Game; onClick: () => void }) {
  const c = game.computed;
  const width = Math.min(100, Math.max(4, c.roi * 100));
  return (
    <li className="card" onClick={onClick}>
      <div className="card-head">
        <span className="price-tag">${game.price}</span>
        <span className="game-name">{game.name}</span>
      </div>
      <div className="roi-row">
        <div className="roi-bar">
          <div
            className="roi-fill"
            style={{ width: `${width}%`, background: roiColor(c.roi) }}
          />
        </div>
        <span className="per-dollar" style={{ color: roiColor(c.roi) }}>
          {centsPerDollar(netPerDollar(c.roi))}
          <span className="per-dollar-unit"> / $1</span>
        </span>
      </div>
      <div className="card-stats">
        <span>{pct(c.roi, 0)} return</span>
        <span>
          Top {usdCompact(c.topPrizeAmount)} · {c.topPrizesRemaining} left
        </span>
        <span>{pct(c.fractionRemaining, 0)} unsold</span>
      </div>
    </li>
  );
}

function Detail({ game, onClose }: { game: Game; onClose: () => void }) {
  const c = game.computed;
  const net = netPerDollar(c.roi);
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
          <Kpi label="ROI" value={pct(c.roi, 1)} accent={roiColor(c.roi)} />
          <Kpi label="EV / ticket" value={usd2(c.evPerTicket)} />
          <Kpi label="Tickets left" value={int(c.ticketsRemaining)} />
          <Kpi label="Prize $ left" value={usdCompact(c.remainingPrizeValue)} />
        </div>

        <p className="plain">
          For every <strong>$1</strong> spent on this game, expect about{" "}
          <strong>{usd2(c.roi)}</strong> back — a net of{" "}
          <strong style={{ color: roiColor(c.roi) }}>{centsPerDollar(net)}</strong> per dollar.
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
