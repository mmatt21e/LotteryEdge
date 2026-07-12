import { useCallback, useEffect, useState } from "react";

/** State persisted to localStorage under `key`, SSR/quota safe. */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }, [key, value]);

  return [value, setValue] as const;
}

export interface LedgerEntry {
  id: string;
  date: string; // YYYY-MM-DD
  gameName: string;
  spent: number;
  won: number;
}

export function useLedger() {
  const [entries, setEntries] = useLocalStorage<LedgerEntry[]>("ledger-nc", []);
  const add = useCallback(
    (e: Omit<LedgerEntry, "id">) =>
      setEntries((prev) => [{ ...e, id: `${e.date}-${prev.length}-${e.gameName}` }, ...prev]),
    [setEntries],
  );
  const remove = useCallback(
    (id: string) => setEntries((prev) => prev.filter((x) => x.id !== id)),
    [setEntries],
  );
  return { entries, add, remove };
}
