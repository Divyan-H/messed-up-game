/**
 * Lightweight monitoring with no third-party service:
 *  - errors (server crashes and browser errors reported by players) go into a capped Redis list;
 *  - Redis commands are counted per function instance and flushed to a monthly counter now and then,
 *    giving an estimate of usage against Upstash's free tier;
 *  - GET /api/health (protected) summarises both, and a scheduled GitHub Action opens an issue when
 *    something needs attention.
 */
import { istDateKey } from '../src/core/clock';
import type { Cmd, Redis } from './redis';
import { K } from './store';

export const FREE_TIER_COMMANDS = 500_000;
const ERROR_LIMIT = 200;
const FLUSH_EVERY_MS = 10 * 60 * 1000;

export interface ErrorEntry {
  t: number;
  src: 'server' | 'client';
  msg: string;
  where?: string;
}

export async function recordError(redis: Redis, e: ErrorEntry): Promise<void> {
  const entry = { ...e, msg: e.msg.slice(0, 300), where: e.where?.slice(0, 200) };
  await redis.multi([['LPUSH', K.errors, JSON.stringify(entry)], ['LTRIM', K.errors, 0, ERROR_LIMIT - 1]]).catch(() => undefined);
}

const monthOf = (now: number): string => istDateKey(now).slice(0, 7);

/** Wraps a Redis client and counts every command it sends. */
export class CountingRedis implements Redis {
  private pending = 0;
  private lastFlush = 0;

  constructor(
    private readonly inner: Redis,
    private readonly clock: () => number = Date.now,
  ) {
    this.lastFlush = clock();
  }

  cmd<T = unknown>(command: Cmd): Promise<T> {
    this.pending++;
    return this.inner.cmd<T>(command);
  }

  multi(commands: Cmd[]): Promise<unknown[]> {
    this.pending += commands.length;
    return this.inner.multi(commands);
  }

  /** Adds the pending count to this month's total (at most every 10 minutes per instance). */
  async flush(force = false): Promise<void> {
    const now = this.clock();
    if (!this.pending || (!force && now - this.lastFlush < FLUSH_EVERY_MS)) return;
    const key = K.stats(monthOf(now));
    const n = this.pending + 2; // include the two commands of this flush
    this.pending = 0;
    this.lastFlush = now;
    await this.inner.multi([['INCRBY', key, n], ['EXPIRE', key, 40 * 86_400]]).catch(() => undefined);
  }
}

export interface Health {
  ok: boolean;
  month: string;
  commandsThisMonth: number;
  projectedThisMonth: number;
  freeTierCommands: number;
  projectedPercent: number;
  errors24h: number;
  recentErrors: ErrorEntry[];
  players: number;
  reminderPlayers: number;
}

export async function health(redis: Redis, now: number): Promise<Health> {
  const month = monthOf(now);
  const [cmds, errs, players, pushers] = await redis.multi([
    ['GET', K.stats(month)],
    ['LRANGE', K.errors, 0, 49],
    ['HLEN', K.nick],
    ['SCARD', K.pushers],
  ]);
  const commandsThisMonth = Number(cmds) || 0;
  const today = istDateKey(now);
  const day = Number(today.slice(8, 10));
  const [y, m] = month.split('-').map(Number) as [number, number];
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const projectedThisMonth = Math.round((commandsThisMonth / Math.max(1, day)) * daysInMonth);
  const recentErrors = ((errs as string[] | null) ?? []).flatMap((raw) => {
    try {
      return [JSON.parse(raw) as ErrorEntry];
    } catch {
      return [];
    }
  });
  const errors24h = recentErrors.filter((e) => now - e.t < 86_400_000).length;
  const projectedPercent = Math.round((projectedThisMonth / FREE_TIER_COMMANDS) * 100);
  return {
    ok: errors24h === 0 && projectedPercent < 80,
    month,
    commandsThisMonth,
    projectedThisMonth,
    freeTierCommands: FREE_TIER_COMMANDS,
    projectedPercent,
    errors24h,
    recentErrors: recentErrors.slice(0, 10),
    players: Number(players) || 0,
    reminderPlayers: Number(pushers) || 0,
  };
}
