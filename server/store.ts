/**
 * Data model in Redis.
 *
 *   mu:u:<sub>              hash: name, created, streak (JSON), best, days (JSON), att (JSON attempt), banned
 *   mu:names                hash: lower-case nickname -> sub   (makes nicknames unique)
 *   mu:nick                 hash: sub -> nickname              (leaderboard display)
 *   mu:lock:<date>:<sub>    one Daily attempt per account per day (SET NX)
 *   mu:b:daily:<date>       sorted set sub -> best verified score that day (expires after 8 days)
 *   mu:b:alltime            sorted set sub -> best verified single run
 *   mu:b:streak             sorted set sub -> best streak
 *   mu:rl:<bucket>:<id>     rate-limit counters
 *
 * `sub` is Google's stable account ID. No email, name or photo is stored.
 */
import { emptyStreak, type StreakState } from '../src/services/streak';
import type { Level } from '../src/game/difficulty';
import { randomNickname } from '../src/services/nickname';
import { HttpError } from './http';
import { isNicknameAllowed } from './moderation';
import { hashFromReply, type Redis } from './redis';

export const K = {
  user: (sub: string) => `mu:u:${sub}`,
  names: 'mu:names',
  nick: 'mu:nick',
  lock: (date: string, sub: string) => `mu:lock:${date}:${sub}`,
  daily: (date: string) => `mu:b:daily:${date}`,
  alltime: 'mu:b:alltime',
  streak: 'mu:b:streak',
  rate: (bucket: string, id: string) => `mu:rl:${bucket}:${id}`,
};

export interface Attempt {
  id: string;
  date: string;
  weekday: number;
  level: Level;
  startedAt: number;
  status: 'started' | 'done';
  score?: number;
  stages?: number;
  rank?: number;
}

export interface DayResult {
  d: string;
  s: number;
}

export interface User {
  sub: string;
  name: string;
  created: number;
  streak: StreakState;
  best: number;
  days: DayResult[];
  att: Attempt | null;
  banned: boolean;
}

const parse = <T>(raw: string | undefined, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export async function getUser(redis: Redis, sub: string): Promise<User | null> {
  const h = hashFromReply(await redis.cmd(['HGETALL', K.user(sub)]));
  if (!h.name) return null;
  return {
    sub,
    name: h.name,
    created: Number(h.created) || 0,
    streak: { ...emptyStreak(), ...parse<Partial<StreakState>>(h.streak, {}) },
    best: Number(h.best) || 0,
    days: parse<DayResult[]>(h.days, []),
    att: parse<Attempt | null>(h.att, null),
    banned: h.banned === '1',
  };
}

/** First sign-in: claim a free random nickname and create the account. */
export async function createUser(redis: Redis, sub: string, now: number, rand: () => number = Math.random): Promise<User> {
  for (let i = 0; i < 12; i++) {
    const name = randomNickname(rand);
    if (!isNicknameAllowed(name)) continue;
    const claimed = await redis.cmd<number>(['HSETNX', K.names, name.toLowerCase(), sub]);
    if (claimed !== 1) continue;
    const user: User = { sub, name, created: now, streak: emptyStreak(), best: 0, days: [], att: null, banned: false };
    await redis.multi([
      ['HSET', K.user(sub), 'name', name, 'created', now, 'streak', JSON.stringify(user.streak), 'best', 0, 'days', '[]'],
      ['HSET', K.nick, sub, name],
    ]);
    return user;
  }
  throw new HttpError(503, 'no_free_names');
}

export async function renameUser(redis: Redis, user: User, name: string): Promise<User> {
  if (name === user.name) return user;
  if (!isNicknameAllowed(name)) throw new HttpError(422, 'name_not_allowed');
  const lower = name.toLowerCase();
  const claimed = await redis.cmd<number>(['HSETNX', K.names, lower, user.sub]);
  if (claimed !== 1) {
    const owner = await redis.cmd<string | null>(['HGET', K.names, lower]);
    if (owner !== user.sub) throw new HttpError(409, 'name_taken');
  }
  const cmds: Array<Array<string | number>> = [
    ['HSET', K.user(user.sub), 'name', name],
    ['HSET', K.nick, user.sub, name],
  ];
  if (user.name.toLowerCase() !== lower) cmds.push(['HDEL', K.names, user.name.toLowerCase()]);
  await redis.multi(cmds);
  return { ...user, name };
}

/** Fixed-window counter. Throws 429 once `limit` calls happen inside `windowSeconds`. */
export async function rateLimit(redis: Redis, bucket: string, id: string, limit: number, windowSeconds: number): Promise<void> {
  const key = K.rate(bucket, id);
  const [count] = (await redis.multi([['INCR', key], ['EXPIRE', key, windowSeconds]])) as [number];
  if (count > limit) throw new HttpError(429, 'rate_limited', { retryAfter: windowSeconds });
}
