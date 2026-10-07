/**
 * Minimal Upstash Redis REST client. Single commands go to the base URL; `multi` uses
 * /multi-exec so a group of writes is applied atomically (all or nothing).
 */
export type Cmd = Array<string | number>;

export interface Redis {
  cmd<T = unknown>(command: Cmd): Promise<T>;
  multi(commands: Cmd[]): Promise<unknown[]>;
}

export class RedisError extends Error {}

type Fetch = typeof fetch;

export class UpstashRedis implements Redis {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetchImpl: Fetch = (...a) => fetch(...a),
  ) {}

  private async post(path: string, body: unknown): Promise<unknown> {
    const res = await this.fetchImpl(`${this.url.replace(/\/+$/, '')}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) throw new RedisError(`redis ${res.status}: ${JSON.stringify(json)}`);
    return json;
  }

  async cmd<T = unknown>(command: Cmd): Promise<T> {
    const json = (await this.post('', command)) as { result?: unknown; error?: string } | null;
    if (!json || json.error) throw new RedisError(json?.error ?? 'redis: empty reply');
    return json.result as T;
  }

  async multi(commands: Cmd[]): Promise<unknown[]> {
    const json = (await this.post('/multi-exec', commands)) as Array<{ result?: unknown; error?: string }> | { error?: string } | null;
    if (!Array.isArray(json)) throw new RedisError((json as { error?: string } | null)?.error ?? 'redis: bad transaction reply');
    for (const r of json) if (r.error) throw new RedisError(r.error);
    return json.map((r) => r.result);
  }
}

/** HGETALL replies are flat [field, value, field, value, ...] lists. */
export function hashFromReply(reply: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(reply)) for (let i = 0; i + 1 < reply.length; i += 2) out[String(reply[i])] = String(reply[i + 1]);
  return out;
}
