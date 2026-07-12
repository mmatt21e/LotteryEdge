import { useEffect, useState } from "react";
import { useLocalStorage } from "./storage.js";

export type Theme = "auto" | "light" | "dark";

/** Theme preference applied to <html data-theme>; "auto" follows the OS. */
export function useTheme() {
  const [theme, setTheme] = useLocalStorage<Theme>("theme", "auto");
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);
  const cycle = () => setTheme((t) => (t === "auto" ? "light" : t === "light" ? "dark" : "auto"));
  return { theme, cycle };
}

/** True when the browser reports it's offline. */
export function useOnline() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
}

/** Captures the PWA install prompt so we can offer an in-app "Install" button. */
export function useInstallPrompt() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  const install = async () => {
    if (!evt) return;
    await evt.prompt();
    setEvt(null);
  };
  return { canInstall: !!evt, install };
}
