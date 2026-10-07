/** Thin JSON client for the game's own API (same origin, session cookie sent automatically). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: Record<string, unknown> | null,
  ) {
    super(code);
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Lets the request finish after the page closes (used when a run is abandoned). */
  keepalive?: boolean;
  timeoutMs?: number;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await fetch(path, {
      method,
      credentials: 'same-origin',
      keepalive: opts.keepalive,
      signal: opts.keepalive ? undefined : ctl.signal,
      headers: method === 'GET' ? undefined : { 'content-type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(opts.body ?? {}),
    });
    let data: Record<string, unknown> | null = null;
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      /* empty or non-JSON reply */
    }
    if (!res.ok) throw new ApiError(res.status, String(data?.error ?? `http_${res.status}`), data);
    return data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, 'network', null);
  } finally {
    clearTimeout(timer);
  }
}
