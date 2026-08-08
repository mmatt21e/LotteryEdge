import { useId, useState } from "react";
import { Sheet } from "../Sheet.js";
import { Chip, TOP_PRIZE_TIERS } from "./primitives.js";

/** Shared search plus progressively disclosed filters for every game list. */
interface FilterControlsProps {
  query: string;
  onQuery: (q: string) => void;
  searchPlaceholder?: string;
  prices: number[];
  price: number | "all";
  onPrice: (p: number | "all") => void;
  sortOptions: { value: string; label: string }[];
  sort: string;
  onSort: (s: string) => void;
  sortNote?: string;
  stateChips?: {
    keys: string[];
    active: Set<string>;
    onToggle: (k: string) => void;
    onClear: () => void;
  };
  /** Minimum top-prize size filter ($0 = off); chips from TOP_PRIZE_TIERS. */
  topPrize?: { value: number; onChange: (min: number) => void };
  toggles: React.ReactNode;
  /** Active states owned by opaque toggle controls, excluding action buttons. */
  activeToggleLabels?: string[];
  /** Restores query, filters, sort, and toggles to the view's defaults. */
  onReset?: () => void;
}

export function FilterControls({
  query,
  onQuery,
  searchPlaceholder = "Search games…",
  prices,
  price,
  onPrice,
  sortOptions,
  sort,
  onSort,
  sortNote,
  stateChips,
  topPrize,
  toggles,
  activeToggleLabels = [],
  onReset,
}: FilterControlsProps) {
  const [open, setOpen] = useState(false);
  const searchId = useId();
  const sortLabel = sortOptions.find((option) => option.value === sort)?.label ?? "Recommended";
  const defaultSort = sortOptions[0]?.value ?? sort;
  const searchLabel = query.trim()
    ? `Search “${query.trim().length > 18 ? `${query.trim().slice(0, 18)}…` : query.trim()}”`
    : null;
  const activeFilters = [
    searchLabel,
    price === "all" ? null : `$${price}`,
    stateChips && stateChips.active.size > 0
      ? `${stateChips.active.size} state${stateChips.active.size === 1 ? "" : "s"}`
      : null,
    topPrize && topPrize.value > 0
      ? TOP_PRIZE_TIERS.find((tier) => tier.min === topPrize.value)?.label
      : null,
    ...activeToggleLabels,
  ].filter((label): label is string => Boolean(label));
  const activeCount = activeFilters.length + (sort !== defaultSort ? 1 : 0);
  const canReset = activeCount > 0 && onReset;

  return (
    <div className="controls">
      <div className="control-toolbar">
        <div className="search-wrap">
          <span className="search-icon" aria-hidden="true">⌕</span>
          <label className="sr-only" htmlFor={searchId}>Search games</label>
          <input
            id={searchId}
            className="search"
            type="search"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
        </div>
        <button
          className="filter-button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" />
          </svg>
          <span>Filters</span>
          {activeCount > 0 && <span className="filter-count">{activeCount}</span>}
        </button>
      </div>
      <div className="filter-summary-row">
        <div className="filter-summary" aria-live="polite">
          <span>Sorted by {sortLabel}</span>
          {activeFilters.length > 0 && <span> · {activeFilters.join(" · ")}</span>}
        </div>
        {canReset && (
          <button className="filter-reset" onClick={() => onReset?.()}>
            Reset
          </button>
        )}
      </div>

      {open && (
        <Sheet label="Filters and sorting" className="filter-sheet" onClose={() => setOpen(false)}>
          <div className="sheet-head">
            <div>
              <div className="sheet-title">Filters &amp; sort</div>
              <div className="sheet-sub">Narrow the list without losing your place</div>
            </div>
            <button className="close" onClick={() => setOpen(false)} aria-label="Close filters">
              ✕
            </button>
          </div>

          {stateChips && (
            <section className="filter-group" aria-labelledby={`${searchId}-states`}>
              <h3 id={`${searchId}-states`}>State</h3>
              <div className="chips scroll-chips" role="group" aria-label="Filter by state">
                <Chip active={stateChips.active.size === 0} onClick={stateChips.onClear}>
                  All states
                </Chip>
                {stateChips.keys.map((key) => (
                  <Chip key={key} active={stateChips.active.has(key)} onClick={() => stateChips.onToggle(key)}>
                    {key.toUpperCase()}
                  </Chip>
                ))}
              </div>
            </section>
          )}

          <section className="filter-group" aria-labelledby={`${searchId}-price`}>
            <h3 id={`${searchId}-price`}>Ticket price</h3>
            <div className="chips" role="group" aria-label="Filter by price">
              <Chip active={price === "all"} onClick={() => onPrice("all")}>
                Any price
              </Chip>
              {prices.map((p) => (
                <Chip key={p} active={price === p} onClick={() => onPrice(p)}>
                  ${p}
                </Chip>
              ))}
            </div>
          </section>

          {topPrize && (
            <section className="filter-group" aria-labelledby={`${searchId}-prize`}>
              <h3 id={`${searchId}-prize`}>Top prize</h3>
              <div className="chips" role="group" aria-label="Filter by top prize size">
                {TOP_PRIZE_TIERS.map((t) => (
                  <Chip key={t.min} active={topPrize.value === t.min} onClick={() => topPrize.onChange(t.min)}>
                    {t.label}
                  </Chip>
                ))}
              </div>
            </section>
          )}

          <section className="filter-group" aria-labelledby={`${searchId}-options`}>
            <h3 id={`${searchId}-options`}>More options</h3>
            <div className="toggles">{toggles}</div>
          </section>

          <section className="filter-group" aria-labelledby={`${searchId}-sort`}>
            <h3 id={`${searchId}-sort`}>Sort results</h3>
            <div className="sort">
              <label className="sr-only" htmlFor={`${searchId}-sort-select`}>Sort results</label>
              <select
                id={`${searchId}-sort-select`}
                value={sort}
                onChange={(e) => onSort(e.target.value)}
              >
                {sortOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {sortNote && <div className="sort-note">{sortNote}</div>}
          </section>

          <div className="filter-sheet-actions">
            {canReset && (
              <button className="filter-sheet-reset" onClick={() => onReset?.()}>
                Reset all
              </button>
            )}
            <button className="sheet-done" onClick={() => setOpen(false)}>
              Show results
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
