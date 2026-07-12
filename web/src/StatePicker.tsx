import { useEffect, useMemo, useRef, useState } from "react";
import { STATES, UNAVAILABLE, ALL_KEY, stateName, type StateInfo } from "./states.js";

/**
 * Searchable state picker. Opens a sheet with a filter box and two groups —
 * full EV states and lite (top-prize only) states — plus a greyed "not yet
 * available" section that explains, per state, why it isn't here.
 */
export function StatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      // Focus the search box once the sheet is mounted.
      const t = setTimeout(() => searchRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
  }, [open]);

  const query = q.trim().toLowerCase();
  const match = (name: string) => !query || name.toLowerCase().includes(query);

  const full = useMemo(() => STATES.filter((s) => s.tier === "full" && match(s.name)), [query]);
  const lite = useMemo(() => STATES.filter((s) => s.tier === "lite" && match(s.name)), [query]);
  const soon = useMemo(() => UNAVAILABLE.filter((s) => match(s.name)), [query]);
  const nothing = full.length === 0 && lite.length === 0 && soon.length === 0;

  const pick = (key: string) => {
    onChange(key);
    setOpen(false);
  };

  return (
    <>
      <button className="state-picker-btn" onClick={() => setOpen(true)} aria-label="Choose state">
        <span className="state-picker-name">{stateName(value)}</span>
        <span className="state-picker-caret">▾</span>
      </button>

      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="sheet picker-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grab" />
            <div className="sheet-head">
              <div className="sheet-title">Choose a state</div>
              <button className="close" onClick={() => setOpen(false)} aria-label="Close">
                ✕
              </button>
            </div>

            <input
              ref={searchRef}
              className="search picker-search"
              type="search"
              placeholder="Search states…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />

            <div className="picker-list">
              {match("All states") && (
                <div className="picker-group">
                  <button
                    className={`picker-row picker-row-all ${value === ALL_KEY ? "picker-row-on" : ""}`}
                    onClick={() => pick(ALL_KEY)}
                  >
                    <span className="picker-row-name">◎ All states combined</span>
                    {value === ALL_KEY ? (
                      <span className="picker-row-check">✓</span>
                    ) : (
                      <span className="picker-group-hint">every full-EV state, ranked together</span>
                    )}
                  </button>
                </div>
              )}
              {full.length > 0 && (
                <Group title="Full ranking" hint="EV & net-per-$1">
                  {full.map((s) => (
                    <StateRow key={s.key} s={s} active={s.key === value} onPick={pick} />
                  ))}
                </Group>
              )}
              {lite.length > 0 && (
                <Group title="Lite" hint="top prize & closing-soon only">
                  {lite.map((s) => (
                    <StateRow key={s.key} s={s} active={s.key === value} onPick={pick} />
                  ))}
                </Group>
              )}
              {soon.length > 0 && (
                <Group title="Not yet available" hint="has a lottery, can't rank it yet">
                  {soon.map((s) => (
                    <div key={s.name} className="picker-row picker-row-off">
                      <span className="picker-row-name">{s.name}</span>
                      <span className="picker-row-reason">{s.reason}</span>
                    </div>
                  ))}
                </Group>
              )}
              {nothing && <div className="status">No states match “{q}”.</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="picker-group">
      <div className="picker-group-head">
        <span className="picker-group-title">{title}</span>
        <span className="picker-group-hint">{hint}</span>
      </div>
      {children}
    </div>
  );
}

function StateRow({
  s,
  active,
  onPick,
}: {
  s: StateInfo;
  active: boolean;
  onPick: (key: string) => void;
}) {
  return (
    <button
      className={`picker-row ${active ? "picker-row-on" : ""}`}
      onClick={() => onPick(s.key)}
    >
      <span className="picker-row-name">{s.name}</span>
      {active && <span className="picker-row-check">✓</span>}
    </button>
  );
}
