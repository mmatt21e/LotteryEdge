import { useEffect, useMemo, useRef, useState } from "react";
import { useScratchers } from "./useScratchers.js";
import { Sparkline } from "./Sparkline.js";
import { buildDemoHistory, distinctDates } from "./demo.js";
import { useLocalStorage, useLedger } from "./storage.js";
import { useChanges, type GameChange } from "./changes.js";
import { useTheme, useOnline, useInstallPrompt } from "./ux.js";
import type { Game, History, LiteResult, LiteGame } from "./types.js";
import { isLimited } from "./types.js";
import { usd, usd2, usdCompact, pct, int, relativeTime, netPerDollar, centsPerDollar } from "./format.js";
import {
  profitOdds,
  confidence,
  computeVelocity,
  isoDaysAgo,
  todayIso,
  trendDirection,
  pointNet,
  effectiveRoi,
  ticketsToTopPrize,
  recommendForBudget,
  endingSoon,
  type ConfidenceLevel,
} from "./analytics.js";

type SortKey = "roi" | "topPrize" | "topLeft" | "unsold" | "price";
type Tab = "value" | "sellers" | "me";

/** States the app can show, alphabetical. Full = EV; lite = list only. */
const STATES: { key: string; name: string; lite?: boolean }[] = [
  { key: "ar", name: "Arkansas" },
  { key: "ca", name: "California" },
  { key: "ct", name: "Connecticut" },
  { key: "id", name: "Idaho" },
  { key: "ia", name: "Iowa" },
  { key: "la", name: "Louisiana" },
  { key: "md", name: "Maryland" },
  { key: "ms", name: "Mississippi" },
  { key: "mo", name: "Missouri" },
  { key: "nc", name: "North Carolina" },
  { key: "oh", name: "Ohio" },
  { key: "ok", name: "Oklahoma" },
  { key: "sc", name: "South Carolina" },
  { key: "tx", name: "Texas" },
  { key: "va", name: "Virginia", lite: true },
  { key: "wa", name: "Washington" },
];

export default function App() {
  const [stateKey, setStateKey] = useLocalStorage<string>("state", "nc");
  const { data, history, loading, error, refresh } = useScratchers(stateKey);
  const [tab, setTab] = useState<Tab>("value");
  const [selected, setSelected] = useState<Game | null>(null);
  const [afterTax, setAfterTax] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [favs, setFavs] = useLocalStorage<string[]>("favs-nc", []);
  const favSet = useMemo(() => new Set(favs), [favs]);
  const toggleFav = (id: string) =>
    setFavs((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const limited = isLimited(data);
  const ncGames = useMemo<Game[]>(
    () => (!limited && data ? (data as { games: Game[] }).games : []),
    [limited, data],
  );
  const changes = useChanges(limited ? undefined : ncGames, data?.generatedAt);
  const ledger = useLedger();
  const { theme, cycle } = useTheme();
  const online = useOnline();
  const { canInstall, install } = useInstallPrompt();

  // Fire local notifications for favorited games that changed since last visit
  // (only when the user has granted permission). Once per data generation.
  const notifiedFor = useRef<string>("");
  useEffect(() => {
    if (!data || limited || notifiedFor.current === data.generatedAt) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (changes.size === 0) return;
    notifiedFor.current = data.generatedAt;
    for (const id of favs) {
      const ch = changes.get(id);
      if (!ch) continue;
      const name = ncGames.find((g) => g.gameId === id)?.name ?? "A favorite game";
      const bits: string[] = [];
      if (ch.topClaimed > 0) bits.push(`${ch.topClaimed} top prize claimed`);
      if (Math.abs(ch.netDelta) >= 0.005) bits.push(ch.netDelta > 0 ? "better value" : "worse value");
      try {
        new Notification("LotteryEdge", { body: `${name}: ${bits.join(" · ")}`, icon: "icon.svg" });
      } catch {
        /* ignore */
      }
    }
  }, [data, limited, changes, favs, ncGames]);

  // With ≤1 real day of history, trends/velocity have nothing to show, so we
  // fall back to clearly-labeled SAMPLE data generated from today's snapshot.
  const isDemo = !limited && distinctDates(history) <= 1;
  const effHistory = useMemo(
    () => (!limited && isDemo ? buildDemoHistory(ncGames) : history),
    [limited, isDemo, ncGames, history],
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark">◆</span> LotteryEdge
        </div>
        <div className="top-actions">
          {canInstall && (
            <button className="refresh install-pill" onClick={install} aria-label="Install app">
              ⬇︎
            </button>
          )}
          <button className="refresh" onClick={cycle} aria-label={`Theme: ${theme}`}>
            {theme === "auto" ? "🌗" : theme === "light" ? "☀️" : "🌙"}
          </button>
          <button className="refresh" onClick={() => setShowInfo(true)} aria-label="How it works">
            ?
          </button>
          <button className="refresh" onClick={refresh} disabled={loading} aria-label="Refresh">
            <span className={loading ? "spin" : ""}>↻</span>
          </button>
        </div>
      </header>

      {!online && <div className="offline-banner">Offline — showing the last saved data.</div>}

      <div className="meta">
        <label className="state-select">
          <select value={stateKey} onChange={(e) => setStateKey(e.target.value)} aria-label="State">
            {STATES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
                {s.lite ? " (lite)" : ""}
              </option>
            ))}
          </select>
        </label>
        {data && (
          <span className="freshness">
            {data.gameCount} games · updated {relativeTime(data.generatedAt)}
          </span>
        )}
      </div>

      {loading && !data && <div className="status">Loading…</div>}
      {error && !data && (
        <div className="status error">
          No data yet for {stateKey.toUpperCase()} ({error}). It appears once the scraper has
          published it.
        </div>
      )}

      {data && limited && <LiteView data={data as LiteResult} />}

      {data && !limited && (
        <>
          <div className="tabs" role="tablist">
            <button className={`tab ${tab === "value" ? "tab-on" : ""}`} onClick={() => setTab("value")}>
              Best value
            </button>
            <button className={`tab ${tab === "sellers" ? "tab-on" : ""}`} onClick={() => setTab("sellers")}>
              Hot sellers
            </button>
            <button className={`tab ${tab === "me" ? "tab-on" : ""}`} onClick={() => setTab("me")}>
              My tickets
            </button>
          </div>

          {isDemo && tab !== "me" && (
            <div className="demo-banner">
              <strong>Sample data</strong> — trend lines and “Hot sellers” below use{" "}
              <em>illustrative</em> history until 2+ daily updates are collected. Prices, odds, EV and
              net/$1 are real.
            </div>
          )}

          {tab === "value" && (
            <ValueTab
              games={ncGames}
              history={effHistory}
              demo={isDemo}
              afterTax={afterTax}
              onAfterTax={setAfterTax}
              favSet={favSet}
              onToggleFav={toggleFav}
              changes={changes}
              onSelect={setSelected}
            />
          )}
          {tab === "sellers" && (
            <SellersTab games={ncGames} history={effHistory} demo={isDemo} onSelect={setSelected} />
          )}
          {tab === "me" && <MeTab games={ncGames} ledger={ledger} afterTax={afterTax} />}

          <p className="disclaimer">
            ROI uses <em>estimated</em> tickets remaining — good for ranking, not a promise of profit.
            Most games sit below break-even.
          </p>
        </>
      )}

      {selected && (
        <Detail
          game={selected}
          history={effHistory}
          demo={isDemo}
          afterTax={afterTax}
          isFav={favSet.has(selected.gameId)}
          onToggleFav={() => toggleFav(selected.gameId)}
          onClose={() => setSelected(null)}
        />
      )}

      {showInfo && <InfoSheet onClose={() => setShowInfo(false)} />}
    </div>
  );
}

/* ------------------------------- Best value ------------------------------- */

function ValueTab({
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
      return effectiveRoi(b, afterTax) - effectiveRoi(a, afterTax);
    });
    return l;
  }, [games, price, sort, query, topOnly, favOnly, endingOnly, favSet, afterTax]);

  return (
    <>
      <div className="controls">
        <input
          className="search"
          type="search"
          placeholder="Search games…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
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
        <div className="control-row">
          <div className="sort">
            <label>
              Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="roi">Best value / $1</option>
                <option value="topPrize">Top prize size</option>
                <option value="topLeft">Top prizes left</option>
                <option value="unsold">% unsold</option>
                <option value="price">Price</option>
              </select>
            </label>
          </div>
          <div className="toggles">
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
              title="Estimate net after federal + NC withholding"
            >
              After tax
            </button>
            <button className="chip budget-btn" onClick={() => setShowBudget(true)}>
              💡 Budget
            </button>
          </div>
        </div>
      </div>

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
  afterTax,
  isFav,
  onToggleFav,
  change,
  onClick,
}: {
  game: Game;
  history: History | null;
  demo: boolean;
  afterTax: boolean;
  isFav: boolean;
  onToggleFav: () => void;
  change?: GameChange;
  onClick: () => void;
}) {
  const c = game.computed;
  const roi = effectiveRoi(game, afterTax);
  const width = Math.min(100, Math.max(4, roi * 100));
  const conf = confidence(c.fractionRemaining);
  const odds = profitOdds(game);
  const ending = endingSoon(game);
  const nets = (history?.series[game.gameId]?.points ?? []).map(pointNet);

  return (
    <li className="card" onClick={onClick}>
      <div className="card-head">
        <span className="price-tag">${game.price}</span>
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
        <span className="per-dollar" style={{ color: roiColor(roi) }}>
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
        <span>Top {usdCompact(c.topPrizeAmount)} · {c.topPrizesRemaining} left</span>
        {nets.length >= 2 && (
          <span className="card-spark" title={demo ? "Sample trend" : "Net/$1 trend"}>
            <Sparkline values={nets} color={roiColor(roi)} width={64} height={18} dashed={demo} />
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

/* ------------------------------- Lite (VA) -------------------------------- */

function LiteView({ data }: { data: LiteResult }) {
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
        <strong>Virginia — limited data.</strong> VA doesn’t publish per-prize “remaining” counts,
        so there’s no EV / net-per-$1 here — only each game’s <em>top prize</em> and a{" "}
        <strong>closing-soon</strong> flag.
      </div>

      <div className="controls">
        <input
          className="search"
          type="search"
          placeholder="Search games…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
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
        <div className="control-row">
          <div className="sort">
            <label>
              Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as "top" | "price")}>
                <option value="top">Top prize</option>
                <option value="price">Price</option>
              </select>
            </label>
          </div>
          <div className="toggles">
            <button
              className={`chip ${closingOnly ? "chip-on" : ""}`}
              onClick={() => setClosingOnly((v) => !v)}
            >
              ⏳ Closing soon
            </button>
          </div>
        </div>
      </div>

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
              <a
                className="official lite-link"
                href={`https://www.valottery.com/scratchers/${g.gameId}`}
                target="_blank"
                rel="noreferrer"
              >
                details ↗
              </a>
            </div>
          </li>
        ))}
      </ul>

      <p className="disclaimer">
        Source: valottery.com. A full EV ranking (like NC) needs per-prize remaining counts, which
        Virginia doesn’t publish.
      </p>
    </>
  );
}

/* --------------------------------- Detail --------------------------------- */

function Detail({
  game,
  history,
  demo,
  afterTax,
  isFav,
  onToggleFav,
  onClose,
}: {
  game: Game;
  history: History | null;
  demo: boolean;
  afterTax: boolean;
  isFav: boolean;
  onToggleFav: () => void;
  onClose: () => void;
}) {
  const c = game.computed;
  const roi = effectiveRoi(game, afterTax);
  const net = netPerDollar(roi);
  const conf = confidence(c.fractionRemaining);
  const odds = profitOdds(game);
  const points = history?.series[game.gameId]?.points ?? [];
  const nets = points.map(pointNet);
  const dir = trendDirection(nets);
  const toTop = ticketsToTopPrize(game);
  const run100 = Math.floor(100 / game.price) * game.price * (roi - 1); // net over ~$100
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
          <div className="sheet-actions">
            <button
              className="close"
              onClick={() => shareGame(game, roi)}
              aria-label="Share"
              title="Share"
            >
              ⤴
            </button>
            <button
              className={`star ${isFav ? "star-on" : ""}`}
              onClick={onToggleFav}
              aria-label={isFav ? "Unfavorite" : "Favorite"}
            >
              {isFav ? "★" : "☆"}
            </button>
            <button className="close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        {afterTax && <div className="tax-note">Showing net after estimated federal + NC tax.</div>}
        <div className="kpis">
          <Kpi label="Net / $1 spent" value={centsPerDollar(net)} accent={roiColor(roi)} />
          <Kpi label="Return / $1" value={usd2(roi)} />
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
            <Sparkline values={nets} color={roiColor(roi)} width={320} height={54} dashed={demo} />
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
          For every <strong>$1</strong> spent, expect about <strong>{usd2(roi)}</strong> back — a
          net of <strong style={{ color: roiColor(roi) }}>{centsPerDollar(net)}</strong> per dollar
          {afterTax ? " (after tax)" : ""}.
          {odds && (
            <>
              {" "}
              Chance of winning more than the ${game.price} ticket:{" "}
              <strong>1 in {int(odds)}</strong>.
            </>
          )}
        </p>

        <div className="projection">
          <div className="proj-item">
            <span className="proj-val">{toTop ? `~${int(toTop)}` : "—"}</span>
            <span className="proj-label">tickets to a top prize (avg)</span>
          </div>
          <div className="proj-item">
            <span className="proj-val" style={{ color: roiColor(roi) }}>
              {run100 >= 0 ? "+" : "−"}${Math.abs(run100).toFixed(0)}
            </span>
            <span className="proj-label">
              expected net on a $100 run{afterTax ? " (after tax)" : ""}
            </span>
          </div>
        </div>

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

function shareGame(game: Game, roi: number) {
  const text = `${game.name} ($${game.price}) — ${centsPerDollar(netPerDollar(roi))} net per $1 on LotteryEdge`;
  const url = location.href;
  if (typeof navigator !== "undefined" && navigator.share) {
    void navigator.share({ title: "LotteryEdge", text, url }).catch(() => {});
  } else if (typeof navigator !== "undefined" && navigator.clipboard) {
    void navigator.clipboard.writeText(`${text} ${url}`).catch(() => {});
  }
}

function InfoSheet({ onClose }: { onClose: () => void }) {
  const [perm, setPerm] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported",
  );
  const enableAlerts = async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setPerm(p);
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <div className="sheet-title">How LotteryEdge works</div>
          <button className="close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="alerts-box">
          <div>
            <strong>Change alerts</strong>
            <div className="alerts-sub">
              {perm === "granted"
                ? "On — you’ll get a notification when a favorite changes (when you open the app)."
                : perm === "unsupported"
                  ? "Notifications aren’t supported on this browser."
                  : "Get notified when a ★ favorite’s top prize is claimed or its value shifts."}
            </div>
          </div>
          {perm !== "granted" && perm !== "unsupported" && (
            <button className="add-btn" onClick={enableAlerts}>
              Enable
            </button>
          )}
        </div>

        <div className="info">
          <h4>What it measures</h4>
          <p>
            For each scratch-off, it compares the <strong>prizes still unclaimed</strong> against an
            estimate of the <strong>tickets still unsold</strong> to gauge what a ticket is worth
            right now.
          </p>

          <h4>Net / $1 spent</h4>
          <p>
            The headline number. <strong>−6.7¢ / $1</strong> means that, on average, you lose about
            7 cents per dollar. The least-negative game is the best available — but nearly all
            scratch-offs sit below break-even.
          </p>

          <h4>Odds “1 in X to profit”</h4>
          <p>
            Your chance of winning <em>more</em> than the ticket price — the honest odds, not the
            “win anything” figure (which counts break-even prizes).
          </p>

          <h4>Confidence</h4>
          <p>
            The EV assumes prizes are won in proportion to tickets sold. That’s noisy for brand-new
            games (little sold) or nearly-finished ones (few left), which get a{" "}
            <strong>low</strong> tag.
          </p>

          <h4>Trends &amp; Hot sellers</h4>
          <p>
            Built from a daily snapshot. Until 2+ days are collected they show clearly-labeled{" "}
            <strong>sample</strong> data.
          </p>

          <h4>“Ending soon”</h4>
          <p>
            NC doesn’t publish claim deadlines for active games, so this is a{" "}
            <em>sell-through</em> signal: a game with almost none of its print run left is winding
            down and will likely be pulled soon. It’s a heads-up, not an official date.
          </p>

          <h4>The estimate isn’t a promise</h4>
          <p>
            States don’t publish “tickets remaining,” so it’s derived. Great for ranking — never a
            guarantee of winning.
          </p>

          <div className="rg">
            <strong>Play responsibly.</strong> This tool finds the least-bad odds; it can’t make
            the lottery profitable. If gambling stops being fun, call{" "}
            <a href="tel:18004262537">1-800-GAMBLER</a> (free, confidential, 24/7).
          </div>
        </div>
      </div>
    </div>
  );
}

function BudgetSheet({
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
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <div className="sheet-title">Budget helper</div>
          <button className="close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
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
                <span style={{ color: roiColor(roi) }}>
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
      </div>
    </div>
  );
}

function MeTab({
  games,
  ledger,
  afterTax,
}: {
  games: Game[];
  ledger: ReturnType<typeof useLedger>;
  afterTax: boolean;
}) {
  const [name, setName] = useState("");
  const [spent, setSpent] = useState("");
  const [won, setWon] = useState("");
  const totals = useMemo(() => {
    const s = ledger.entries.reduce((a, e) => a + e.spent, 0);
    const w = ledger.entries.reduce((a, e) => a + e.won, 0);
    return { spent: s, won: w, net: w - s };
  }, [ledger.entries]);

  const canAdd = name.trim() && Number(spent) > 0;
  const submit = () => {
    if (!canAdd) return;
    ledger.add({
      date: todayIso(),
      gameName: name.trim(),
      spent: Number(spent) || 0,
      won: Number(won) || 0,
    });
    setName("");
    setSpent("");
    setWon("");
  };

  return (
    <>
      <div className="totals">
        <Kpi label="Spent" value={usd2(totals.spent)} />
        <Kpi label="Won" value={usd2(totals.won)} />
        <Kpi
          label="Net"
          value={`${totals.net >= 0 ? "+" : "−"}${usd2(Math.abs(totals.net)).replace("$", "$")}`}
          accent={totals.net >= 0 ? "#3ddc97" : "#e08a5b"}
        />
      </div>

      <div className="ledger-form">
        <input
          list="game-names"
          placeholder="Game name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <datalist id="game-names">
          {games.map((g) => (
            <option key={g.gameId} value={g.name} />
          ))}
        </datalist>
        <div className="ledger-amounts">
          <label>
            Spent $
            <input type="number" min={0} value={spent} onChange={(e) => setSpent(e.target.value)} />
          </label>
          <label>
            Won $
            <input type="number" min={0} value={won} onChange={(e) => setWon(e.target.value)} />
          </label>
          <button className="add-btn" onClick={submit} disabled={!canAdd}>
            Add
          </button>
        </div>
      </div>

      {ledger.entries.length === 0 ? (
        <div className="status">
          Log tickets you buy to track your <em>real</em> win/loss against the app’s estimates.
        </div>
      ) : (
        <ul className="list">
          {ledger.entries.map((e) => (
            <li key={e.id} className="card ledger-row">
              <div className="seller-main">
                <div className="card-head">
                  <span className="game-name">{e.gameName}</span>
                </div>
                <div className="card-stats">
                  <span>{e.date}</span>
                  <span>spent ${e.spent}</span>
                  <span>won ${e.won}</span>
                  <span
                    style={{ color: e.won - e.spent >= 0 ? "#3ddc97" : "#e08a5b", fontWeight: 700 }}
                  >
                    {e.won - e.spent >= 0 ? "+" : "−"}${Math.abs(e.won - e.spent)}
                  </span>
                </div>
              </div>
              <button className="close" onClick={() => ledger.remove(e.id)} aria-label="Delete">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {afterTax && (
        <p className="disclaimer">Tip: “After tax” affects estimates, not your logged actuals.</p>
      )}
    </>
  );
}
