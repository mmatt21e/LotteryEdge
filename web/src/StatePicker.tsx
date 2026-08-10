import { useEffect, useMemo, useRef, useState } from "react";
import { FullPage, type PageBack } from "./Sheet.js";
import { STATES, UNAVAILABLE, ALL_KEY, stateName, type StateInfo } from "./states.js";

/** "tx" -> "· TX", ["tx","ca"] -> "· TX, CA", more -> "· TX +2". */
function filterSuffix(keys: string[]): string {
  if (keys.length === 0) return "";
  const up = keys.map((k) => k.toUpperCase());
  return up.length <= 2 ? ` · ${up.join(", ")}` : ` · ${up[0]} +${up.length - 1}`;
}

/**
 * Searchable state picker. Opens a full page with a filter box and two groups —
 * full EV states and lite (top-prize only) states — plus a greyed "not yet
 * available" section that explains, per state, why it isn't here.
 */
export function StatePicker({
  value,
  onChange,
  allFilter = [],
}: {
  value: string;
  onChange: (key: string) => void;
  /**
   * The combined view's quick-select state filter, so the button and the
   * chips always agree ("All states · TX" while the TX chip is active).
   */
  allFilter?: string[];
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

  const pick = (key: string, back: PageBack) => {
    onChange(key);
    back();
  };

  return (
    <>
      <button
        className="state-picker-btn"
        onClick={() => setOpen(true)}
        aria-label="Choose state"
        aria-expanded={open}
      >
        <span className="state-picker-name">
          {stateName(value)}
          {value === ALL_KEY ? filterSuffix(allFilter) : ""}
        </span>
        <span className="state-picker-caret">▾</span>
      </button>

      {open && (
        <FullPage
          label="Choose a state"
          title="Choose a state"
          subtitle="Pick one lottery or compare full-ranking states together"
          className="picker-sheet"
          onClose={() => setOpen(false)}
        >
          {(back) => (
            <>
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
                    onClick={() => pick(ALL_KEY, back)}
                  >
                    <span className="picker-row-name">◎ All states combined</span>
                    {value === ALL_KEY ? (
                      <>
                        {allFilter.length > 0 && (
                          <span className="picker-group-hint">
                            filtered to {allFilter.map((k) => k.toUpperCase()).join(", ")}
                          </span>
                        )}
                        <span className="picker-row-check">✓</span>
                      </>
                    ) : (
                      <span className="picker-group-hint">every full-EV state, ranked together</span>
                    )}
                  </button>
                </div>
              )}
              {full.length > 0 && (
                <Group title="Full ranking" hint="EV & net-per-$1">
                  {full.map((s) => (
                    <StateRow key={s.key} s={s} active={s.key === value} onPick={(key) => pick(key, back)} />
                  ))}
                </Group>
              )}
              {lite.length > 0 && (
                <Group title="Lite" hint="top prize & closing-soon only">
                  {lite.map((s) => (
                    <StateRow key={s.key} s={s} active={s.key === value} onPick={(key) => pick(key, back)} />
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
            </>
          )}
        </FullPage>
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
