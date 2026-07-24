import { useEffect, useMemo, useRef, useState } from "react";
import { useScratchers, useAllScratchers } from "./useScratchers.js";
import { buildDemoHistory, distinctDates } from "./demo.js";
import { useLocalStorage, useLedger } from "./storage.js";
import { useChanges } from "./changes.js";
import { useTheme, useOnline, useInstallPrompt } from "./ux.js";
import { StatePicker } from "./StatePicker.js";
import { stateName, ALL_KEY, retailerUrl, isKnownState } from "./states.js";
import type { Game, LiteResult } from "./types.js";
import { isLimited } from "./types.js";
import { relativeTime, shortDateTime } from "./format.js";
import { todayIso } from "./analytics.js";
import { TabBar, type Tab } from "./components/TabBar.js";
import { ValueTab } from "./views/ValueTab.js";
import { AllStatesView } from "./views/AllStatesView.js";
import { SellersTab } from "./views/SellersTab.js";
import { RetailersView } from "./views/RetailersView.js";
import { LiteView } from "./views/LiteView.js";
import { MeTab } from "./views/MeTab.js";
import { useWinners } from "./useWinners.js";
import { Detail } from "./sheets/Detail.js";
import { InfoSheet } from "./sheets/InfoSheet.js";

export default function App() {
  const [storedState, setStateKey] = useLocalStorage<string>("state", "nc");
  // A persisted key can outlive the catalog (e.g. VA was delisted until its
  // scraper works) — fall back rather than dead-end on a state with no data.
  const stateKey = isKnownState(storedState) ? storedState : "nc";
  const isAll = stateKey === ALL_KEY;
  const { data, history, loading, error, refresh } = useScratchers(stateKey);
  const all = useAllScratchers();
  const [tab, setTab] = useState<Tab>("value");
  const [selected, setSelected] = useState<Game | null>(null);
  const [afterTax, setAfterTax] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  // Favorites are namespaced per state so switching states shows that state's
  // own ★ list rather than bleeding NC's game ids into, say, Texas.
  const [favsByState, setFavsByState] = useLocalStorage<Record<string, string[]>>("favs", {});
  // The combined view's quick-select state filter lives here (not inside the
  // view) so the state-picker button can mirror it — the dropdown and the
  // chips always tell the same story. Empty array = all states.
  const [allStatesFilter, setAllStatesFilter] = useLocalStorage<string[]>(
    "all-states-filter",
    [],
  );
  const favs = useMemo(() => favsByState[stateKey] ?? [], [favsByState, stateKey]);
  const favSet = useMemo(() => new Set(favs), [favs]);
  const toggleFav = (id: string) => toggleFavIn(stateKey, id);
  // Game-based helpers so the combined view can favorite across states, each
  // game landing in its own state's list.
  const toggleFavIn = (st: string, id: string) =>
    setFavsByState((prev) => {
      const cur = prev[st] ?? [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { ...prev, [st]: next };
    });
  const isFavGame = (g: Game) => (favsByState[g.state] ?? []).includes(g.gameId);

  const limited = isLimited(data);
  const ncGames = useMemo<Game[]>(
    () => (!limited && data ? (data as { games: Game[] }).games : []),
    [limited, data],
  );
  const changes = useChanges(limited || isAll ? undefined : ncGames, data?.generatedAt, stateKey);
  const ledger = useLedger(stateKey);
  const winners = useWinners(isAll ? "" : stateKey);
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
          <button
            className="refresh"
            onClick={isAll ? all.refresh : refresh}
            disabled={isAll ? all.loading : loading}
            aria-label="Refresh"
          >
            <span className={(isAll ? all.loading : loading) ? "spin" : ""}>↻</span>
          </button>
        </div>
      </header>

      {!online && <div className="offline-banner">Offline — showing the last saved data.</div>}

      <div className="meta">
        <StatePicker
          value={stateKey}
          onChange={setStateKey}
          allFilter={isAll ? allStatesFilter : []}
        />
        {isAll && all.generatedAt && (
          <span className="freshness" title={shortDateTime(all.generatedAt)}>
            {all.games.length} games ·{" "}
            {allStatesFilter.length > 0
              ? `${allStatesFilter.length} of ${all.loaded.length} states shown`
              : `${all.loaded.length} states`}{" "}
            · updated {shortDateTime(all.generatedAt)} ({relativeTime(all.generatedAt)})
          </span>
        )}
        {!isAll && data && (
          <span className="freshness" title={shortDateTime(data.generatedAt)}>
            {data.gameCount} games · updated {shortDateTime(data.generatedAt)} (
            {relativeTime(data.generatedAt)})
          </span>
        )}
      </div>

      {!isAll && retailerUrl(stateKey) && (
        <a className="retailer-link" href={retailerUrl(stateKey)} target="_blank" rel="noreferrer">
          📍 Find a retailer in {stateName(stateKey)} ↗
        </a>
      )}

      {isAll && (
        <AllStatesView
          all={all}
          stateFilter={allStatesFilter}
          onStateFilter={setAllStatesFilter}
          afterTax={afterTax}
          onAfterTax={setAfterTax}
          isFav={isFavGame}
          onToggleFav={(g) => toggleFavIn(g.state, g.gameId)}
          onSelect={setSelected}
        />
      )}

      {!isAll && loading && !data && <div className="status">Loading…</div>}
      {!isAll && error && !data && (
        <div className="status error">
          No data yet for {stateKey.toUpperCase()} ({error}). It appears once the scraper has
          published it.
        </div>
      )}
      {!isAll && error && data && (
        <div className="status">Refresh failed ({error}) — showing the last loaded data.</div>
      )}

      {!isAll && data && limited && (
        <>
          <LiteView data={data as LiteResult} />
          {winners && (
            <>
              <div className="tiers-head lite-retailers-head">
                <span>Retailers with posted winners</span>
              </div>
              <RetailersView winners={winners} stateName={stateName(stateKey)} />
            </>
          )}
        </>
      )}

      {!isAll && data && !limited && (
        <>
          <TabBar tab={tab} onTab={setTab} />

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
          {tab === "retailers" && (
            <RetailersView winners={winners} stateName={stateName(stateKey)} />
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
          history={isAll ? null : effHistory}
          demo={isAll ? false : isDemo}
          afterTax={afterTax}
          showState={isAll}
          isFav={isFavGame(selected)}
          onToggleFav={() => toggleFavIn(selected.state, selected.gameId)}
          logged={(ledger.byState[selected.state] ?? []).filter(
            (e) => e.gameName === selected.name,
          )}
          onLogTicket={(qty) =>
            ledger.addTo(selected.state, {
              date: todayIso(),
              gameName: selected.name,
              spent: qty * selected.price,
              won: null,
            })
          }
          onClose={() => setSelected(null)}
        />
      )}

      {showInfo && <InfoSheet onClose={() => setShowInfo(false)} />}

      <footer className="version-line">LotteryEdge v{__APP_VERSION__}</footer>
    </div>
  );
}
