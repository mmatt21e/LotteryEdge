import { Sheet } from "../Sheet.js";

export function AppMenuSheet({
  theme,
  canInstall,
  refreshing,
  retailerHref,
  retailerName,
  onTheme,
  onInstall,
  onRefresh,
  onInfo,
  onClose,
}: {
  theme: "auto" | "light" | "dark";
  canInstall: boolean;
  refreshing: boolean;
  retailerHref?: string;
  retailerName: string;
  onTheme: () => void;
  onInstall: () => void;
  onRefresh: () => void;
  onInfo: () => void;
  onClose: () => void;
}) {
  const themeLabel = theme === "auto" ? "Match device" : theme === "light" ? "Light" : "Dark";

  const closeThen = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <Sheet label="App menu" className="app-menu-sheet" onClose={onClose}>
      <div className="sheet-head">
        <div>
          <div className="sheet-title">LotteryEdge menu</div>
          <div className="sheet-sub">App tools and official links</div>
        </div>
        <button className="close" onClick={onClose} aria-label="Close menu">
          ✕
        </button>
      </div>

      <div className="menu-list">
        <button className="menu-row" onClick={() => closeThen(onRefresh)} disabled={refreshing}>
          <span className={`menu-icon ${refreshing ? "spin" : ""}`} aria-hidden="true">
            ↻
          </span>
          <span>
            <strong>{refreshing ? "Refreshing data…" : "Refresh data"}</strong>
            <small>Check for the latest published results</small>
          </span>
          <span className="menu-chevron" aria-hidden="true">›</span>
        </button>

        <button className="menu-row" onClick={onTheme}>
          <span className="menu-icon" aria-hidden="true">
            {theme === "auto" ? "◐" : theme === "light" ? "☀" : "☾"}
          </span>
          <span>
            <strong>Appearance</strong>
            <small>{themeLabel} · tap to change</small>
          </span>
          <span className="menu-chevron" aria-hidden="true">›</span>
        </button>

        {canInstall && (
          <button className="menu-row" onClick={() => closeThen(onInstall)}>
            <span className="menu-icon" aria-hidden="true">↓</span>
            <span>
              <strong>Install LotteryEdge</strong>
              <small>Add the app to this device</small>
            </span>
            <span className="menu-chevron" aria-hidden="true">›</span>
          </button>
        )}

        {retailerHref && (
          <a className="menu-row" href={retailerHref} target="_blank" rel="noreferrer">
            <span className="menu-icon" aria-hidden="true">⌖</span>
            <span>
              <strong>Find a retailer</strong>
              <small>Open the official {retailerName} finder</small>
            </span>
            <span className="menu-chevron" aria-hidden="true">↗</span>
          </a>
        )}

        <button className="menu-row" onClick={() => closeThen(onInfo)}>
          <span className="menu-icon" aria-hidden="true">?</span>
          <span>
            <strong>How it works</strong>
            <small>Estimates, alerts, taxes, and responsible play</small>
          </span>
          <span className="menu-chevron" aria-hidden="true">›</span>
        </button>
      </div>
    </Sheet>
  );
}
