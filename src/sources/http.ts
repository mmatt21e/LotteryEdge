/** Identify the scraper honestly on every request. */
export const UA = "LotteryEdge/0.1 (personal scratch-off EV tool)";

async function request(
  url: string,
  accept: string,
  timeoutMs: number,
  init: RequestInit,
): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": UA, Accept: accept, ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  return res;
}

/** Polite fetch: identifies the client and sets a sane timeout. */
export async function fetchText(url: string, timeoutMs = 30_000): Promise<string> {
  return (await request(url, "text/html,application/xhtml+xml", timeoutMs, {})).text();
}

/** Polite JSON fetch with the same identification + timeout policy. */
export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 30_000,
): Promise<T> {
  return (await request(url, "application/json", timeoutMs, init)).json() as Promise<T>;
}

/** Run an async mapper over items with bounded concurrency (politeness cap). */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, worker));
  return results;
}
