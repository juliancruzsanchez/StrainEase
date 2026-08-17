// Local cache for AI-generated results (strain recommendations and
// comparisons). Identical requests within the TTL hit the cache instead of
// calling the AI again, which keeps AI usage down.
const PREFIX = "strainwise:ai:v2:";
const TTL_MS = 24 * 60 * 60 * 1000;

export function cacheKey(label: string, input: unknown): string {
  let raw: string;
  try {
    raw = JSON.stringify(input);
  } catch {
    raw = String(input);
  }
  return `${label}:${raw}`;
}

export async function cachedRun<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const storageKey = PREFIX + key;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const entry = JSON.parse(raw) as { at: number; value: T };
      if (Date.now() - entry.at < TTL_MS) return entry.value;
      localStorage.removeItem(storageKey);
    }
  } catch {
    // Cache unavailable — just run the action.
  }

  const value = await fn();

  try {
    localStorage.setItem(storageKey, JSON.stringify({ at: Date.now(), value }));
  } catch {
    // Quota or privacy mode — skip caching.
  }

  return value;
}
