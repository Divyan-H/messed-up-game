/** Typed, failure-tolerant wrapper over localStorage (falls back to memory in private mode). */
const memory = new Map<string, string>();

function backend(): Storage | null {
  try {
    const s = globalThis.localStorage;
    const probe = '__mu_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = backend()?.getItem(key) ?? memory.get(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  try {
    const b = backend();
    if (b) b.setItem(key, raw);
    else memory.set(key, raw);
  } catch {
    memory.set(key, raw);
  }
}
