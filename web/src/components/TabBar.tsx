import { useRef } from "react";

export type Tab = "value" | "sellers" | "retailers" | "me";

export const TAB_ORDER: { key: Tab; label: string }[] = [
  { key: "value", label: "Best value" },
  { key: "sellers", label: "Hot sellers" },
  { key: "retailers", label: "Retailers" },
  { key: "me", label: "My tickets" },
];

export function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  // Roving tabindex: the active tab is the tab stop; arrows move + focus.
  const refs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const onKey = (e: React.KeyboardEvent) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const i = TAB_ORDER.findIndex((t) => t.key === tab);
    const next = TAB_ORDER[(i + dir + TAB_ORDER.length) % TAB_ORDER.length]!.key;
    onTab(next);
    refs.current[next]?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label="Sections" onKeyDown={onKey}>
      {TAB_ORDER.map(({ key, label }) => (
        <button
          key={key}
          ref={(el) => (refs.current[key] = el)}
          className={`tab ${tab === key ? "tab-on" : ""}`}
          role="tab"
          aria-selected={tab === key}
          tabIndex={tab === key ? 0 : -1}
          onClick={() => onTab(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
