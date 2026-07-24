import { useEffect, useMemo, useState } from "react";
import { Sheet } from "../Sheet.js";
import { Sparkline } from "../Sparkline.js";
import { stateName, retailerUrl } from "../states.js";
import { useWinners } from "../useWinners.js";
import { winnersForGame } from "../retailers.js";
import type { Game, History } from "../types.js";
import type { LedgerEntry } from "../storage.js";
import { usd, usd2, usdCompact, pct, int, compact, shortDay, netPerDollar, centsPerDollar } from "../format.js";
import {
  profitOdds,
  liveTierOdds,
  liveProfitOdds,
  confidence,
  trendDirection,
  pointNet,
  effectiveRoi,
  ticketsToTopPrize,
  topPrizeAttempt,
  dailySales,
  dailyBreakdown,
  prizesWonPreviousDay,
  gameAnalysis,
  simulateGame,
} from "../analytics.js";
import {
  Kpi,
  roiColor,
  signColor,
  dirColor,
  dirLabel,
  CONF_COLOR,
} from "../components/primitives.js";

export function Detail({
  game,
  history,
  demo,
  afterTax,
  showState,
  isFav,
  onToggleFav,
  logged,
  onLogTicket,
  onClose,
}: {
  game: Game;
  history: History | null;
  demo: boolean;
  afterTax: boolean;
  showState?: boolean;
  isFav: boolean;
  onToggleFav: () => void;
  logged: LedgerEntry[];
  onLogTicket: (qty: number) => void;
  onClose: () => void;
}) {
  const c = game.computed;
  const roi = effectiveRoi(game, afterTax);
  const net = netPerDollar(roi);
  const conf = confidence(c.fractionRemaining);
  const odds = profitOdds(game); // as printed
  const liveOdds = liveProfitOdds(game); // recomputed from what's left
  const points = history?.series[game.gameId]?.points ?? [];
  const nets = points.map(pointNet);
  const dir = trendDirection(nets);
  const toTop = ticketsToTopPrize(game);
  const attempt = topPrizeAttempt(game, afterTax);
  const sales = dailySales(history?.series[game.gameId]);
  const breakdown = dailyBreakdown(history?.series[game.gameId]);
  const wonPrev = prizesWonPreviousDay(history?.series[game.gameId]);
  const positiveEv = c.roi >= 1;
  const analysis = gameAnalysis(game);
  const [showHistory, setShowHistory] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(positiveEv);
  const [showSim, setShowSim] = useState(false);
  const run100 = Math.floor(100 / game.price) * game.price * (roi - 1); // net over ~$100
  const tiers = [...game.tiers].sort((a, b) => b.amount - a.amount);
  // Posted winners for this game's state (null when the state has no feed),
  // fetched here so the section also works from the all-states view.
  const stateWinners = useWinners(game.state);
  const gameWinners = useMemo(
    () => winnersForGame(stateWinners?.winners ?? [], game.name),
    [stateWinners, game.name],
  );

  return (
    <Sheet label={game.name} onClose={onClose}>
        <div className="sheet-head">
          <div>
            <div className="sheet-title">{game.name}</div>
            <div className="sheet-sub">
              {showState && <strong>{stateName(game.state)} · </strong>}${game.price} · game #
              {game.gameId}
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

        {afterTax && (
          <div className="tax-note">Showing net after estimated federal + state tax.</div>
        )}
        <div className="kpis">
          <Kpi label="Net / $1 spent" value={centsPerDollar(net)} accent={signColor(net)} />
          <Kpi label="Return / $1" value={usd2(roi)} />
          <Kpi
            label="Odds to profit (now)"
            value={liveOdds ? `1 in ${int(liveOdds)}` : odds ? `1 in ${int(odds)}` : "—"}
            sub={liveOdds && odds ? `printed 1 in ${int(odds)}` : undefined}
          />
          <Kpi label="EV / ticket" value={usd2(c.evPerTicket)} />
          <Kpi label="Tickets left" value={int(c.ticketsRemaining)} />
          <Kpi label="Prize $ left" value={usdCompact(c.remainingPrizeValue)} />
        </div>

        <LogPurchase
          game={game}
          logged={logged}
          showState={showState}
          onLog={onLogTicket}
        />

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

        <div className="sales-row">
          <div className="sales-item">
            <span className="sales-val">{sales ? int(Math.round(sales.avgPerDay)) : "—"}</span>
            <span className="sales-label">
              avg sold / day {demo && <span className="sample-pill">Sample</span>}
            </span>
          </div>
          <div className="sales-item">
            <span className="sales-val">
              {sales && sales.previousDay != null ? int(Math.round(sales.previousDay)) : "—"}
            </span>
            <span className="sales-label">
              sold previous day {demo && <span className="sample-pill">Sample</span>}
            </span>
          </div>
        </div>
        {!sales && (
          <p className="sales-note">
            Daily sales appear once 2+ daily snapshots are collected for this game.
          </p>
        )}

        {sales && (
          <div className="wonprev">
            <div className="wonprev-head">
              Prizes won {wonPrev ? `on ${shortDay(wonPrev.date)}` : "previous day"}{" "}
              {demo && <span className="sample-pill">Sample</span>}
            </div>
            {wonPrev ? (
              wonPrev.total === 0 ? (
                <p className="sales-note">No prizes were claimed that day.</p>
              ) : (
                <ul className="won-list">
                  {wonPrev.prizes.map((p) => (
                    <li key={p.amount} className="won-item">
                      <span className="won-amt">{usdCompact(p.amount)}</span>
                      <span className="won-count">{int(p.count)}</span>
                    </li>
                  ))}
                  <li className="won-item won-total">
                    <span className="won-amt">Total prizes</span>
                    <span className="won-count">{int(wonPrev.total)}</span>
                  </li>
                </ul>
              )
            ) : (
              <p className="sales-note">
                Per-prize daily counts start collecting after the next couple of daily updates.
              </p>
            )}
          </div>
        )}

        {breakdown.length > 0 && (
          <div className="daily-wrap">
            <button
              className="history-btn"
              onClick={() => setShowHistory((v) => !v)}
              aria-expanded={showHistory}
            >
              {showHistory ? "Hide" : "Show"} day-by-day history{" "}
              {demo && <span className="sample-pill">Sample</span>}
            </button>
            {showHistory && (
              <table className="daily">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Tickets sold</th>
                    <th>Prizes won</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((d) => (
                    <tr key={d.date}>
                      <td>{shortDay(d.date)}</td>
                      <td>{int(d.ticketsSold)}</td>
                      <td>
                        {usdCompact(d.prizeValueWon)}
                        {d.topPrizesWon > 0 && (
                          <span className="badge badge-warn daily-top">
                            +{d.topPrizesWon} top
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <div className="conf-line">
          <i style={{ background: CONF_COLOR[conf.level] }} />
          <span>
            <strong>{conf.level} confidence</strong> — {conf.reason}
          </span>
        </div>

        <p className="plain">
          For every <strong>$1</strong> spent, expect about <strong>{usd2(roi)}</strong> back — a
          net of <strong style={{ color: signColor(net) }}>{centsPerDollar(net)}</strong> per dollar
          {afterTax ? " (after tax)" : ""}.
          {(liveOdds ?? odds) && (
            <>
              {" "}
              Chance of winning more than the ${game.price} ticket, based on what’s left:{" "}
              <strong>1 in {int((liveOdds ?? odds)!)}</strong>.
            </>
          )}
        </p>

        <div className="projection">
          <div className="proj-item">
            <span className="proj-val">{toTop ? `~${int(toTop)}` : "—"}</span>
            <span className="proj-label">tickets to a top prize (avg)</span>
          </div>
          <div className="proj-item">
            <span className="proj-val" style={{ color: signColor(run100) }}>
              {run100 >= 0 ? "+" : "−"}${Math.abs(run100).toFixed(0)}
            </span>
            <span className="proj-label">
              expected net on a $100 run{afterTax ? " (after tax)" : ""}
            </span>
          </div>
        </div>

        <div className="attempt">
          <div className="attempt-head">
            Chasing the {usdCompact(c.topPrizeAmount)} top prize
          </div>
          {attempt ? (
            <>
              <div className="attempt-grid">
                <div className="attempt-item">
                  <span className="attempt-val">~{int(attempt.tickets)}</span>
                  <span className="attempt-label">tickets to buy (avg)</span>
                </div>
                <div className="attempt-item">
                  <span className="attempt-val">{usdCompact(attempt.cost)}</span>
                  <span className="attempt-label">cost to attempt</span>
                </div>
                <div className="attempt-item">
                  <span className="attempt-val" style={{ color: "var(--accent)" }}>
                    {usdCompact(attempt.winnings)}
                  </span>
                  <span className="attempt-label">
                    est. winnings{afterTax ? " (after tax)" : ""}
                  </span>
                </div>
                <div className="attempt-item">
                  <span className="attempt-val" style={{ color: signColor(attempt.net) }}>
                    {attempt.net >= 0 ? "+" : "−"}
                    {usdCompact(Math.abs(attempt.net))}
                  </span>
                  <span className="attempt-label">expected net</span>
                </div>
              </div>
              <p className="attempt-note">
                On average you’d buy about <strong>{int(attempt.tickets)}</strong> ${game.price}{" "}
                tickets to hit one top prize — spending <strong>{usd(attempt.cost)}</strong> and
                winning back about <strong>{usd(attempt.winnings)}</strong> across all of them (the
                top prize plus every smaller prize along the way). A long-run average only — any real
                attempt swings wildly and almost always loses.
              </p>
            </>
          ) : (
            <p className="attempt-note">
              No top prizes remain for this game, so there’s nothing left to chase — the{" "}
              {usdCompact(c.topPrizeAmount)} tier is fully claimed.
            </p>
          )}
        </div>

        <div className="analysis-wrap">
          <button
            className="history-btn"
            onClick={() => setShowAnalysis((v) => !v)}
            aria-expanded={showAnalysis}
          >
            {showAnalysis ? "Hide" : "Show"} full breakdown &amp; analysis
          </button>
          {showAnalysis && (
            <div className="analysis">
              {positiveEv && (
                <div className="analysis-note">
                  This game shows <strong>positive expected value</strong> — genuine, but it rides on
                  a big prize still being unclaimed in a nearly-sold-out game, so it’s{" "}
                  <strong>very high variance</strong> (one purchase almost never realizes it). Payout
                  under 100% and odds that reconcile confirm the data is sound.
                </div>
              )}
              <div className="kpis analysis-grid">
                <Kpi label="Ticket price" value={usd2(game.price)} />
                <Kpi
                  label="Overall odds"
                  value={analysis.overallOdds ? `1 in ${analysis.overallOdds.toFixed(2)}` : "—"}
                />
                <Kpi label="Est. tickets printed" value={int(analysis.originalTickets)} />
                <Kpi
                  label="Est. tickets sold"
                  value={int(analysis.ticketsSold)}
                  sub={pct(analysis.fractionSold, 0)}
                />
                <Kpi
                  label="Est. tickets left"
                  value={int(analysis.ticketsRemaining)}
                  sub={pct(analysis.fractionRemaining, 0)}
                />
                <Kpi
                  label="Payout ratio"
                  value={pct(analysis.payoutRatio, 1)}
                  sub="prize $ ÷ sales"
                />
                <Kpi label="Prize $ printed" value={usdCompact(analysis.originalPrizeValue)} />
                <Kpi label="Prize $ won" value={usdCompact(analysis.claimedPrizeValue)} />
                <Kpi label="Prize $ left" value={usdCompact(analysis.remainingPrizeValue)} />
                <Kpi label="EV / ticket" value={usd2(analysis.evPerTicket)} />
                <Kpi label="Return / $1" value={usd2(analysis.roi)} accent={roiColor(analysis.roi)} />
                <Kpi
                  label="Net / $1"
                  value={centsPerDollar(netPerDollar(analysis.roi))}
                  accent={signColor(netPerDollar(analysis.roi))}
                />
              </div>

              <div className="tiers-head">
                <span>Every prize — remaining vs. started</span>
                <span className="tiers-sub">$ left = prize × remaining. Mirrors the state’s table.</span>
              </div>
              <table className="tiers">
                <thead>
                  <tr>
                    <th>Prize</th>
                    <th>Left</th>
                    <th>Start</th>
                    <th>$ left</th>
                  </tr>
                </thead>
                <tbody>
                  {tiers.map((t, i) => (
                    <tr key={i}>
                      <td>{usdCompact(t.amount)}</td>
                      <td className={t.remaining === 0 ? "gone" : ""}>{int(t.remaining)}</td>
                      <td>{int(t.originalCount)}</td>
                      <td>{usdCompact(t.amount * t.remaining)}</td>
                    </tr>
                  ))}
                  <tr className="tier-total">
                    <td>Total</td>
                    <td>{int(analysis.totalPrizesRemaining)}</td>
                    <td>{int(analysis.totalPrizesStart)}</td>
                    <td>{usdCompact(analysis.remainingPrizeValue)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="sim-wrap">
          <button
            className="history-btn"
            onClick={() => setShowSim((v) => !v)}
            aria-expanded={showSim}
          >
            {showSim ? "Hide" : "🎲 Simulate"} odds — remove tickets
          </button>
          {showSim && <Simulator key={game.gameId} game={game} />}
        </div>

        <div className="tiers-head">
          <span>Prize odds</span>
          <span className="tiers-sub">
            Odds are “1 in N”. <strong>Now</strong> = est. tickets left ÷ prizes left · Prizes =
            printed ⁄ still&nbsp;unclaimed.
          </span>
        </div>
        <table className="tiers">
          <thead>
            <tr>
              <th>Prize</th>
              <th>
                1 in
                <span className="th-sub">printed</span>
              </th>
              <th>
                1 in
                <span className="th-sub">now</span>
              </th>
              <th>
                Prizes
                <span className="th-sub">left ⁄ made</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((t, i) => {
              const now = liveTierOdds(c.ticketsRemaining, t.remaining);
              return (
                <tr key={i}>
                  <td>{usdCompact(t.amount)}</td>
                  <td>{t.odds ? compact(t.odds) : "—"}</td>
                  <td className={t.remaining === 0 ? "gone" : "now-odds"}>
                    {t.remaining === 0 ? "gone" : now ? compact(now) : "—"}
                  </td>
                  <td>
                    <span className={t.remaining === 0 ? "gone" : ""}>{compact(t.remaining)}</span>
                    <span className="tier-made"> ⁄ {compact(t.originalCount)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {gameWinners.length > 0 && (
          <>
            <div className="tiers-head">
              <span>Winners posted online — where they bought</span>
              <span className="tiers-sub">
                Only wins the lottery posted publicly. A store that shows up often likely just
                sells (and restocks) a lot of this game.
              </span>
            </div>
            <ul className="won-list winners-where">
              {gameWinners.slice(0, 12).map((w, i) => (
                <li key={i} className="won-item">
                  <span className="won-amt">{usdCompact(w.prize)}</span>
                  <span className="winner-store">
                    {w.retailer}
                    {w.city ? ` · ${w.city}` : ""}
                    {w.date ? ` · ${shortDay(w.date)}` : ""}
                  </span>
                </li>
              ))}
              {gameWinners.length > 12 && (
                <li className="won-item won-total">
                  <span className="won-amt">…and</span>
                  <span className="won-count">{gameWinners.length - 12} more</span>
                </li>
              )}
            </ul>
          </>
        )}

        <div className="detail-links">
          {game.url && (
            <a className="official" href={game.url} target="_blank" rel="noreferrer">
              View official game page ↗
            </a>
          )}
          {retailerUrl(game.state) && (
            <a className="official" href={retailerUrl(game.state)} target="_blank" rel="noreferrer">
              📍 Find a retailer ↗
            </a>
          )}
        </div>
    </Sheet>
  );
}

/* ----------------------------- Log a purchase ----------------------------- */

/**
 * Quick "I bought this" logger: adds the purchase to the My Tickets ledger
 * straight from the game sheet, with the result left pending to fill in after
 * scratching (same flow as the Me tab's manual form).
 */
function LogPurchase({
  game,
  logged,
  showState,
  onLog,
}: {
  game: Game;
  logged: LedgerEntry[];
  showState?: boolean;
  onLog: (qty: number) => void;
}) {
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(false), 2500);
    return () => clearTimeout(t);
  }, [added]);
  const submit = () => {
    onLog(qty);
    setQty(1);
    setAdded(true);
  };
  const spent = logged.reduce((a, e) => a + e.spent, 0);
  const pending = logged.filter((e) => e.won == null).length;

  return (
    <div className="log-purchase">
      <div className="log-row">
        <span className="log-label">🎟 Bought it?</span>
        <div className="sim-step">
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1}>
            −
          </button>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
            aria-label="Number of tickets"
          />
          <button onClick={() => setQty((q) => q + 1)}>+</button>
        </div>
        <button className="add-btn" onClick={submit}>
          {added ? "✓ Added" : `Add · ${usd(qty * game.price)}`}
        </button>
      </div>
      <p className="log-note">
        {logged.length > 0 ? (
          <>
            {logged.length} ticket{logged.length === 1 ? "" : "s"} · {usd(spent)} logged on this
            game{pending > 0 ? ` (${pending} awaiting result)` : ""}.{" "}
          </>
        ) : null}
        Record what you won on the <strong>Me</strong> tab
        {showState ? ` under ${stateName(game.state)}` : ""} after scratching.
      </p>
    </div>
  );
}

/* -------------------------------- Simulator ------------------------------- */

function Simulator({ game }: { game: Game }) {
  const [removed, setRemoved] = useState<Record<number, number>>({});
  const [losers, setLosers] = useState(0);
  const sim = useMemo(() => simulateGame(game, removed, losers), [game, removed, losers]);
  const base = useMemo(() => simulateGame(game, {}, 0), [game]);
  const dirty = sim.removedWinners > 0 || losers > 0;

  const setTier = (amount: number, val: number, max: number) =>
    setRemoved((p) => ({ ...p, [amount]: Math.min(max, Math.max(0, Math.floor(val) || 0)) }));
  const bump = (amount: number, delta: number, max: number) =>
    setRemoved((p) => ({ ...p, [amount]: Math.min(max, Math.max(0, (p[amount] ?? 0) + delta)) }));
  const reset = () => {
    setRemoved({});
    setLosers(0);
  };
  const oddsStr = (o: number | null) => (o ? `1 in ${int(o)}` : "gone");

  return (
    <div className="sim">
      <div className="sim-note">
        Hypothetically remove prizes (winners) or losing tickets and watch the odds move — live, and
        before tax. This never changes the real data.
      </div>
      <div className="kpis sim-stats">
        <Kpi
          label="Net / $1"
          value={centsPerDollar(netPerDollar(sim.roi))}
          accent={signColor(netPerDollar(sim.roi))}
          sub={dirty ? `was ${centsPerDollar(netPerDollar(base.roi))}` : undefined}
        />
        <Kpi
          label="Odds to profit"
          value={oddsStr(sim.profitOdds)}
          sub={dirty && base.profitOdds ? `was 1 in ${int(base.profitOdds)}` : undefined}
        />
        <Kpi
          label="Top-prize odds"
          value={oddsStr(sim.topOdds)}
          sub={dirty && base.topOdds ? `was 1 in ${int(base.topOdds)}` : undefined}
        />
        <Kpi
          label="Tickets left"
          value={int(sim.ticketsRemaining)}
          sub={dirty ? `was ${int(base.ticketsRemaining)}` : undefined}
        />
      </div>

      <div className="sim-row sim-losers">
        <span className="sim-amt">Losing tickets</span>
        <span className="sim-rem" />
        <div className="sim-step">
          <button onClick={() => setLosers((l) => Math.max(0, l - 1000))} disabled={losers <= 0}>
            −
          </button>
          <input
            type="number"
            min={0}
            value={losers}
            onChange={(e) => setLosers(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          />
          <button onClick={() => setLosers((l) => l + 1000)}>+</button>
        </div>
      </div>

      <div className="sim-tiers">
        <div className="sim-row sim-head">
          <span className="sim-amt">Prize</span>
          <span className="sim-rem">left</span>
          <span className="sim-step-label">remove</span>
        </div>
        {sim.tiers.map((t) => (
          <div className="sim-row" key={t.amount}>
            <span className="sim-amt">{usdCompact(t.amount)}</span>
            <span className="sim-rem">
              {int(t.remaining)}
              <span className="sim-base"> / {int(t.baseRemaining)}</span>
            </span>
            <div className="sim-step">
              <button onClick={() => bump(t.amount, -1, t.baseRemaining)} disabled={t.removed <= 0}>
                −
              </button>
              <input
                type="number"
                min={0}
                max={t.baseRemaining}
                value={t.removed}
                onChange={(e) => setTier(t.amount, Number(e.target.value), t.baseRemaining)}
              />
              <button
                onClick={() => bump(t.amount, 1, t.baseRemaining)}
                disabled={t.removed >= t.baseRemaining}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      {dirty && (
        <button className="sim-reset" onClick={reset}>
          ↺ Reset simulation
        </button>
      )}
    </div>
  );
}

function shareGame(game: Game, roi: number) {
  const text = `${game.name} ($${game.price}) — ${centsPerDollar(netPerDollar(roi))} net per $1 on LotteryEdge`;
  const url = location.href;
  if (typeof navigator !== "undefined" && navigator.share) {
    void navigator.share({ title: "LotteryEdge", text, url }).catch(() => {});
  } else if (typeof navigator !== "undefined" && navigator.clipboard) {
    void navigator.clipboard.writeText(`${text} ${url}`).catch(() => {});
  }
}
