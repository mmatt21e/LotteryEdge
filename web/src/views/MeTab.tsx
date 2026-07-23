import { useMemo, useState } from "react";
import { useLedger } from "../storage.js";
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
          value={`${totals.net >= 0 ? "+" : "−"}${usd2(Math.abs(totals.net))}`}
          accent={signColor(totals.net)}
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
                    style={{ color: signColor(e.won - e.spent), fontWeight: 700 }}
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
