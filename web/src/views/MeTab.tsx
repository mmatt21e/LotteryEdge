import { useMemo, useState } from "react";
import { useLedger, type LedgerEntry } from "../storage.js";
import type { Game } from "../types.js";
import { usd2, centsPerDollar } from "../format.js";
import { todayIso, ledgerInsights } from "../analytics.js";
import { Kpi, signColor } from "../components/primitives.js";
import { FullPage } from "../Sheet.js";

export function MeTab({
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
  const [showInsights, setShowInsights] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");

  const totals = useMemo(() => {
    const s = ledger.entries.reduce((a, e) => a + e.spent, 0);
    const w = ledger.entries.reduce((a, e) => a + (e.won ?? 0), 0);
    const pending = ledger.entries.filter((e) => e.won == null).length;
    return { spent: s, won: w, net: w - s, pending };
  }, [ledger.entries]);

  const canAdd = name.trim() && Number(spent) > 0;
  const orderedEntries = useMemo(
    () => [...ledger.entries].sort((a, b) => Number(a.won != null) - Number(b.won != null)),
    [ledger.entries],
  );
  const submit = () => {
    if (!canAdd) return;
    ledger.add({
      date: todayIso(),
      gameName: name.trim(),
      spent: Number(spent) || 0,
      // Blank = result not known yet (scratch it later); an explicit 0 = lost.
      won: won.trim() === "" ? null : Math.max(0, Number(won) || 0),
    });
    setSaveStatus(`${name.trim()} added to purchase history.`);
    setName("");
    setSpent("");
    setWon("");
  };

  return (
    <>
      <div className="tickets-intro">
        <h2>My tickets</h2>
        <p>Log purchases, then add each result after you scratch it.</p>
      </div>
      <div className="totals">
        <Kpi label="Spent" value={usd2(totals.spent)} />
        <Kpi
          label="Won"
          value={usd2(totals.won)}
          sub={totals.pending > 0 ? `${totals.pending} awaiting result` : undefined}
        />
        <Kpi
          label="Net"
          value={`${totals.net >= 0 ? "+" : "−"}${usd2(Math.abs(totals.net))}`}
          accent={signColor(totals.net)}
        />
      </div>

      <div className="ledger-form">
        <h3>Log a ticket</h3>
        <label className="ledger-game-label">
          Game name
          <input
            list="game-names"
            placeholder="Choose or type a game"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
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
            <input
              type="number"
              min={0}
              placeholder="later"
              value={won}
              onChange={(e) => setWon(e.target.value)}
            />
          </label>
          <button className="add-btn" onClick={submit} disabled={!canAdd}>
            Add
          </button>
        </div>
        <p className="ledger-hint">
          Leave “Won $” blank to record the result later; enter 0 for a losing ticket.
        </p>
        <p className="save-status" role="status" aria-live="polite">{saveStatus}</p>
      </div>

      {ledger.entries.length === 0 ? (
        <div className="status">
          Log tickets you buy to track your <em>real</em> win/loss against the app’s estimates —
          add the result right away or once you’ve scratched it.
        </div>
      ) : (
        <>
          <div className="ticket-list-head">
            <h3>Purchase history</h3>
            {totals.pending > 0 && <span>{totals.pending} awaiting result</span>}
          </div>
        <ul className="list">
          {orderedEntries.map((e) => (
            <li key={e.id} className="card ledger-row">
              <div className="seller-main">
                <div className="card-head">
                  <span className="game-name">{e.gameName}</span>
                  {e.won == null && <span className="badge badge-warn">result pending</span>}
                </div>
                <div className="card-stats">
                  <span>{e.date}</span>
                  <span>spent ${e.spent}</span>
                  {e.won != null ? (
                    <>
                      <span>won ${e.won}</span>
                      <span style={{ color: signColor(e.won - e.spent), fontWeight: 700 }}>
                        {e.won - e.spent >= 0 ? "+" : "−"}${Math.abs(e.won - e.spent)}
                      </span>
                    </>
                  ) : (
                    <PendingResult
                      entry={e}
                      onResult={(w) => {
                        ledger.setResult(e.id, w);
                        setSaveStatus(`${e.gameName} result saved: $${w} won.`);
                      }}
                    />
                  )}
                </div>
              </div>
              <button className="close" onClick={() => ledger.remove(e.id)} aria-label="Delete">
                ✕
              </button>
            </li>
          ))}
        </ul>
        </>
      )}

      {ledger.entries.length > 0 && (
        <button className="detail-page-link tickets-insights-link" onClick={() => setShowInsights(true)}>
          <span aria-hidden="true">≈</span>
          <span><strong>Your results vs. the math</strong><small>Expected return, actual wins, and variance</small></span>
          <span aria-hidden="true">›</span>
        </button>
      )}

      {showInsights && (
        <FullPage
          label="Ticket insights"
          title="Your results vs. the math"
          subtitle="Compare resolved tickets with today’s estimated value"
          onClose={() => setShowInsights(false)}
        >
          <Insights entries={ledger.entries} games={games} afterTax={afterTax} />
        </FullPage>
      )}
      {afterTax && (
        <p className="disclaimer">Tip: “After tax” affects estimates, not your logged actuals.</p>
      )}
    </>
  );
}

/**
 * Your results vs. the math: compares logged tickets against what each game's
 * *current* expected value says that spend should return.
 */
function Insights({
  entries,
  games,
  afterTax,
}: {
  entries: LedgerEntry[];
  games: Game[];
  afterTax: boolean;
}) {
  const ins = useMemo(() => ledgerInsights(entries, games, afterTax), [entries, games, afterTax]);
  const hasResolved = ins.resolvedSpent > 0;
  if (!hasResolved && ins.pendingSpent <= 0) return null;

  const luckPerDollar = hasResolved ? ins.luck / ins.resolvedSpent : 0;

  return (
    <div className="insights">
      <div className="insights-head">📈 Insights — you vs. the math</div>

      {hasResolved && (
        <>
          <div className="kpis insights-kpis">
            <Kpi label="Expected back" value={usd2(ins.expectedWon)} sub={`on ${usd2(ins.resolvedSpent)} played`} />
            <Kpi label="Actually won" value={usd2(ins.actualWon)} />
            <Kpi
              label="Luck"
              value={`${ins.luck >= 0 ? "+" : "−"}${usd2(Math.abs(ins.luck))}`}
              accent={signColor(ins.luck)}
              sub={`${centsPerDollar(luckPerDollar)} / $1 vs. expected`}
            />
          </div>
          <p className="insights-plain">
            On the {usd2(ins.resolvedSpent)} you’ve scratched, today’s odds
            {afterTax ? " (after tax)" : ""} would expect about{" "}
            <strong>{usd2(ins.expectedWon)}</strong> back. You actually won{" "}
            <strong>{usd2(ins.actualWon)}</strong> — running{" "}
            <strong style={{ color: signColor(ins.luck) }}>
              {usd2(Math.abs(ins.luck))} {ins.luck >= 0 ? "ahead of" : "behind"}
            </strong>{" "}
            expectation.
          </p>
        </>
      )}

      {ins.pendingSpent > 0 && (
        <p className="insights-plain">
          {usd2(ins.pendingSpent)} still awaiting results — on average worth about{" "}
          <strong>{usd2(ins.pendingExpected)}</strong> back.
        </p>
      )}

      {ins.perGame.length > 0 && (
        <div className="table-scroll" tabIndex={0} aria-label="Per-game ticket insights">
        <table className="tiers insights-table">
          <thead>
            <tr>
              <th>Game</th>
              <th>Spent</th>
              <th>Won</th>
              <th>Expected</th>
              <th>±Luck</th>
            </tr>
          </thead>
          <tbody>
            {ins.perGame.slice(0, 8).map((r) => {
              const luck = r.won - r.expected;
              return (
                <tr key={r.name}>
                  <td className="insights-game">{r.name}</td>
                  <td>{usd2(r.spent)}</td>
                  <td>{usd2(r.won)}</td>
                  <td>{usd2(r.expected)}</td>
                  <td style={{ color: signColor(luck), fontWeight: 700 }}>
                    {luck >= 0 ? "+" : "−"}
                    {usd2(Math.abs(luck))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
      {ins.perGame.length > 8 && (
        <p className="insights-note">…and {ins.perGame.length - 8} more games.</p>
      )}

      <p className="insights-note">
        Expectation uses <em>today’s</em> estimated remaining prizes, not the odds when you bought
        {ins.unmatchedSpent > 0
          ? `; ${usd2(ins.unmatchedSpent)} on games no longer in the catalog is excluded`
          : ""}
        . Short runs swing far from expectation — that’s variance, not fate.
      </p>
    </div>
  );
}

/** Inline editor shown on a ticket whose result hasn't been recorded yet. */
function PendingResult({
  entry,
  onResult,
}: {
  entry: LedgerEntry;
  onResult: (won: number) => void;
}) {
  const [val, setVal] = useState("");
  const save = () => {
    if (val.trim() === "") return;
    onResult(Math.max(0, Number(val) || 0));
  };
  return (
    <span className="pending-result">
      <label>
        Won $
        <input
          type="number"
          min={0}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          aria-label={`Result for ${entry.gameName}`}
        />
      </label>
      <button className="add-btn mini" onClick={save} disabled={val.trim() === ""}>
        Save
      </button>
      <button className="chip mini" onClick={() => onResult(0)}>
        Lost
      </button>
    </span>
  );
}
