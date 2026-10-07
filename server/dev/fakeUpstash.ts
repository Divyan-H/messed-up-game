/**
 * In-memory stand-in for the Upstash REST API, for tests and local development only (never bundled).
 * Implements just the commands the game server uses, with Redis semantics for NX/GT/TTL.
 */
type Val = string | Map<string, string> | Map<string, number>;

export class FakeUpstash {
  private readonly data = new Map<string, { v: Val; exp: number }>();
  commands = 0;

  constructor(private readonly now: () => number = Date.now) {}

  private get(key: string): Val | undefined {
    const e = this.data.get(key);
    if (!e) return undefined;
    if (e.exp && e.exp <= this.now()) {
      this.data.delete(key);
      return undefined;
    }
    return e.v;
  }

  private hash(key: string, create = false): Map<string, string> | undefined {
    let v = this.get(key) as Map<string, string> | undefined;
    if (!v && create) {
      v = new Map();
      this.data.set(key, { v, exp: 0 });
    }
    return v;
  }

  private zset(key: string, create = false): Map<string, number> | undefined {
    let v = this.get(key) as Map<string, number> | undefined;
    if (!v && create) {
      v = new Map();
      this.data.set(key, { v, exp: 0 });
    }
    return v;
  }

  private ranked(key: string): Array<[string, number]> {
    return [...(this.zset(key) ?? new Map()).entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1));
  }

  exec(cmd: Array<string | number>): unknown {
    this.commands++;
    const [op, key, ...rest] = cmd.map(String) as [string, string, ...string[]];
    switch (op.toUpperCase()) {
      case 'GET': {
        const v = this.get(key);
        return typeof v === 'string' ? v : null;
      }
      case 'SET': {
        const opts = rest.slice(1).map((x) => x.toUpperCase());
        if (opts.includes('NX') && this.get(key) !== undefined) return null;
        const ex = opts.indexOf('EX');
        this.data.set(key, { v: rest[0]!, exp: ex >= 0 ? this.now() + Number(rest[ex + 2]) * 1000 : 0 });
        return 'OK';
      }
      case 'DEL':
        return [key, ...rest].filter((k) => this.data.delete(k)).length;
      case 'INCR': {
        const e = this.data.get(key);
        const n = Number(this.get(key) ?? 0) + 1;
        this.data.set(key, { v: String(n), exp: e?.exp ?? 0 });
        return n;
      }
      case 'EXPIRE': {
        const e = this.data.get(key);
        if (!e || this.get(key) === undefined) return 0;
        e.exp = this.now() + Number(rest[0]) * 1000;
        return 1;
      }
      case 'HGETALL':
        return [...(this.hash(key) ?? new Map()).entries()].flat();
      case 'HGET':
        return this.hash(key)?.get(rest[0]!) ?? null;
      case 'HMGET':
        return rest.map((f) => this.hash(key)?.get(f) ?? null);
      case 'HSET': {
        const h = this.hash(key, true)!;
        let added = 0;
        for (let i = 0; i + 1 < rest.length; i += 2) {
          if (!h.has(rest[i]!)) added++;
          h.set(rest[i]!, rest[i + 1]!);
        }
        return added;
      }
      case 'HSETNX': {
        const h = this.hash(key, true)!;
        if (h.has(rest[0]!)) return 0;
        h.set(rest[0]!, rest[1]!);
        return 1;
      }
      case 'HDEL':
        return rest.filter((f) => this.hash(key)?.delete(f)).length;
      case 'ZADD': {
        const z = this.zset(key, true)!;
        const gt = rest[0]?.toUpperCase() === 'GT';
        const args = gt ? rest.slice(1) : rest;
        let added = 0;
        for (let i = 0; i + 1 < args.length; i += 2) {
          const score = Number(args[i]);
          const m = args[i + 1]!;
          const cur = z.get(m);
          if (cur === undefined) added++;
          if (cur === undefined || !gt || score > cur) z.set(m, score);
        }
        return added;
      }
      case 'ZRANGE': {
        const list = rest.map((x) => x.toUpperCase()).includes('REV') ? this.ranked(key) : this.ranked(key).reverse();
        const slice = list.slice(Number(rest[0]), Number(rest[1]) + 1);
        return rest.map((x) => x.toUpperCase()).includes('WITHSCORES') ? slice.flatMap(([m, s]) => [m, String(s)]) : slice.map(([m]) => m);
      }
      case 'ZREVRANK': {
        const i = this.ranked(key).findIndex(([m]) => m === rest[0]);
        return i < 0 ? null : i;
      }
      case 'ZSCORE': {
        const s = this.zset(key)?.get(rest[0]!);
        return s === undefined ? null : String(s);
      }
      default:
        throw new Error(`fake upstash: unsupported ${op}`);
    }
  }

  /** A `fetch` implementation that speaks the Upstash REST protocol. */
  readonly fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const body = JSON.parse(String(init?.body ?? 'null')) as unknown;
    const reply = (fn: () => unknown) => {
      try {
        return { result: fn() };
      } catch (e) {
        return { error: (e as Error).message };
      }
    };
    if (url.pathname.endsWith('/multi-exec') || url.pathname.endsWith('/pipeline')) {
      const out = (body as Array<Array<string | number>>).map((c) => reply(() => this.exec(c)));
      return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify(reply(() => this.exec(body as Array<string | number>))), { headers: { 'content-type': 'application/json' } });
  };
}
