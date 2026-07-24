import { Chip } from "./primitives.js";

/**
 * Shared filter/search/sort controls block used by the Best-value, All-states
 * and Lite views. Renders the exact same DOM the per-view copies used to, so
 * the CSS is untouched; view-specific toggle chips are passed in via
 * `toggles`, and the (persisted) filter state stays in each view.
 */
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
  toggles: React.ReactNode;
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
  toggles,
}: FilterControlsProps) {
  return (
    <div className="controls">
      <input
        className="search"
        type="search"
        placeholder={searchPlaceholder}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
      />

      {stateChips && (
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
      )}

      <div className="chips" role="group" aria-label="Filter by price">
        <Chip active={price === "all"} onClick={() => onPrice("all")}>
          All
        </Chip>
        {prices.map((p) => (
          <Chip key={p} active={price === p} onClick={() => onPrice(p)}>
            ${p}
          </Chip>
        ))}
      </div>

      <div className="control-row">
        <div className="sort">
          <label>
            Sort
            <select value={sort} onChange={(e) => onSort(e.target.value)}>
              {sortOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="toggles">{toggles}</div>
      </div>

      {sortNote && <div className="sort-note">{sortNote}</div>}
    </div>
  );
}
