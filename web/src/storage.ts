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

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export interface LedgerEntry {
  id: string;
  date: string; // YYYY-MM-DD
  gameName: string;
  spent: number;
  /**
   * Winnings in dollars; null = ticket not scratched / result not recorded
   * yet — the result can be filled in later. (Entries saved before this
   * field became nullable always carry a number, so they stay "resolved".)
   */
  won: number | null;
}

export function useLedger(stateKey: string) {
  const [byState, setByState] = useLocalStorage<Record<string, LedgerEntry[]>>("ledger", {});
  const entries = byState[stateKey] ?? [];
  const setEntries = useCallback(
    (updater: (prev: LedgerEntry[]) => LedgerEntry[]) =>
      setByState((prev) => ({ ...prev, [stateKey]: updater(prev[stateKey] ?? []) })),
    [setByState, stateKey],
  );
  const add = useCallback(
    // Unique id per entry: the old date-length-name scheme could collide after
    // a delete, making remove() take out two rows at once.
    (e: Omit<LedgerEntry, "id">) => setEntries((prev) => [{ ...e, id: newId() }, ...prev]),
    [setEntries],
  );
  const remove = useCallback(
    (id: string) => setEntries((prev) => prev.filter((x) => x.id !== id)),
    [setEntries],
  );
  /** Record (or correct) the result of a previously logged ticket. */
  const setResult = useCallback(
    (id: string, won: number) =>
      setEntries((prev) => prev.map((x) => (x.id === id ? { ...x, won } : x))),
    [setEntries],
  );
  return { entries, add, remove, setResult };
}
