import { FullPage } from "../Sheet.js";

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

  return (
    <FullPage
      label="LotteryEdge menu"
      title="LotteryEdge menu"
      subtitle="App tools and official links"
      className="app-menu-sheet"
      onClose={onClose}
    >
      {(back) => (
      <div className="menu-list">
        <button
          className="menu-row"
          onClick={() => {
            back();
            onRefresh();
          }}
          disabled={refreshing}
        >
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
          <button
            className="menu-row"
            onClick={() => {
              back();
              onInstall();
            }}
          >
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
              <small>
                Open the official {retailerName} finder
                <span className="sr-only"> in a new tab</span>
              </small>
            </span>
            <span className="menu-chevron" aria-hidden="true">↗</span>
          </a>
        )}

        <button className="menu-row" onClick={onInfo}>
          <span className="menu-icon" aria-hidden="true">?</span>
          <span>
            <strong>How it works</strong>
            <small>Estimates, alerts, taxes, and responsible play</small>
          </span>
          <span className="menu-chevron" aria-hidden="true">›</span>
        </button>
      </div>
      )}
    </FullPage>
  );
}
