import { useRef } from "react";

export type Tab = "value" | "sellers" | "retailers" | "me";

export const TAB_ORDER: { key: Tab; label: string }[] = [
  { key: "value", label: "Best" },
  { key: "sellers", label: "Trends" },
  { key: "retailers", label: "Places" },
  { key: "me", label: "Tickets" },
];

function TabIcon({ tab }: { tab: Tab }) {
  const paths: Record<Tab, React.ReactNode> = {
    value: <path d="m12 3 2.15 4.36 4.81.7-3.48 3.39.82 4.79L12 15l-4.3 2.24.82-4.79-3.48-3.39 4.81-.7L12 3Z" />,
    sellers: (
      <>
        <path d="M5 19V9" />
        <path d="M12 19V5" />
        <path d="M19 19v-7" />
      </>
    ),
    retailers: (
      <>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    me: (
      <>
        <path d="M5 5h14v14H5z" />
        <path d="M8 9h8M8 13h5" />
      </>
    ),
  };
  return (
    <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[tab]}
    </svg>
  );
}

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
    <nav className="bottom-nav" aria-label="Main sections">
      <div className="tabs" role="tablist" aria-label="LotteryEdge sections" onKeyDown={onKey}>
        {TAB_ORDER.map(({ key, label }) => (
          <button
            key={key}
            id={`tab-${key}`}
            ref={(el) => (refs.current[key] = el)}
            className={`tab ${tab === key ? "tab-on" : ""}`}
            role="tab"
            aria-selected={tab === key}
            aria-controls="main-panel"
            tabIndex={tab === key ? 0 : -1}
            onClick={() => onTab(key)}
          >
            <TabIcon tab={key} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
