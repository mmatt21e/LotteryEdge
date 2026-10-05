import { useRegisterSW } from "virtual:pwa-register/react";

/** Keep an open ticket entry intact until the user chooses to reload. */
export function AppUpdate() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (registration) window.setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });
  if (!needRefresh) return null;
  return <aside className="app-update" role="status">
    <span>A new version is ready. Save any open ticket entry before reloading.</span>
    <button type="button" onClick={() => void updateServiceWorker(true)}>Reload update</button>
  </aside>;
}
