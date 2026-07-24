import { useMemo, useState } from "react";
import { useLedger, type LedgerEntry } from "../storage.js";
import type { Game } from "../types.js";
import { usd2 } from "../format.js";
import { todayIso } from "../analytics.js";
import { Kpi, signColor } from "../components/primitives.js";

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

  const totals = useMemo(() => {
    const s = ledger.entries.reduce((a, e) => a + e.spent, 0);
    const w = ledger.entries.reduce((a, e) => a + (e.won ?? 0), 0);
    const pending = ledger.entries.filter((e) => e.won == null).length;
    return { spent: s, won: w, net: w - s, pending };
  }, [ledger.entries]);

  const canAdd = name.trim() && Number(spent) > 0;
  const submit = () => {
    if (!canAdd) return;
    ledger.add({
      date: todayIso(),
      gameName: name.trim(),
      spent: Number(spent) || 0,
      // Blank = result not known yet (scratch it later); an explicit 0 = lost.
      won: won.trim() === "" ? null : Math.max(0, Number(won) || 0),
    });
    setName("");
    setSpent("");
    setWon("");
  };

  return (
    <>
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
        <input
          list="game-names"
          placeholder="Game name (any ticket)"
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
      </div>

      {ledger.entries.length === 0 ? (
        <div className="status">
          Log tickets you buy to track your <em>real</em> win/loss against the app’s estimates —
          add the result right away or once you’ve scratched it.
        </div>
      ) : (
        <ul className="list">
          {ledger.entries.map((e) => (
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
                    <PendingResult entry={e} onResult={(w) => ledger.setResult(e.id, w)} />
                  )}
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
