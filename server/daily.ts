/**
 * The ranked Daily Run, enforced on the server:
 *  - the date is the server's (IST), so device clocks do not matter;
 *  - each account gets one attempt per day (a Redis lock), across every device and tab;
 *  - the day's maze seed is derived from a server secret, so future mazes cannot be computed in advance;
 *  - the score is never taken from the client: the server replays the submitted inputs through the same
 *    deterministic simulation and records the score that replay produces.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { daysBetween, istDateKey, weekdayOf } from '../src/core/clock';
import type { InputCode } from '../src/core/types';
import { LEVEL_IDS, LEVELS, type Level } from '../src/game/difficulty';
import { PERKS } from '../src/game/perks';
import { MAX_RUN_TICKS, replayRun, type ReplayLog } from '../src/game/run';
import { recordDailyPlay } from '../src/services/streak';
import { HttpError } from './http';
import type { Redis } from './redis';
import { K, type Attempt, type User } from './store';

const TICK_HZ = 60;
/** A finish may arrive late (offline, closed tab), but not days later. */
const FINISH_WINDOW_MS = 36 * 3600 * 1000;
/** Simulated time can never exceed real elapsed time by more than this (the client cannot run faster than real time). */
const CLOCK_SLACK_SECONDS = 10;
const PERK_IDS = new Set(PERKS.map((p) => p.id));

export const serverDate = (now: number): string => istDateKey(now);

export function dailySeed(date: string, secret: string): number {
  return createHmac('sha256', `seed|${secret}`).update(date).digest().readUInt32BE(0);
}

export interface StartResult {
  attemptId: string;
  date: string;
  weekday: number;
  level: Level;
  seed: number;
}

export async function startDaily(redis: Redis, user: User, levelRaw: unknown, secret: string, now: number): Promise<{ result: StartResult; user: User }> {
  const level = LEVEL_IDS.includes(levelRaw as Level) ? (levelRaw as Level) : null;
  if (!level) throw new HttpError(400, 'bad_level');
  if (user.banned) throw new HttpError(403, 'banned');
  const date = serverDate(now);
  if (user.att?.date === date) throw new HttpError(409, 'already_played');
  const id = randomBytes(12).toString('base64url');
  const locked = await redis.cmd<string | null>(['SET', K.lock(date, user.sub), id, 'NX', 'EX', 3 * 86_400]);
  if (locked === null) throw new HttpError(409, 'already_played');

  const att: Attempt = { id, date, weekday: weekdayOf(date), level, startedAt: now, status: 'started' };
  const streak = recordDailyPlay(user.streak, date);
  await redis.multi([
    ['HSET', K.user(user.sub), 'att', JSON.stringify(att), 'streak', JSON.stringify(streak)],
    ['ZADD', K.streak, 'GT', streak.best, user.sub],
  ]);
  return {
    result: { attemptId: id, date, weekday: att.weekday, level, seed: dailySeed(date, secret) },
    user: { ...user, att, streak },
  };
}

export interface FinishBody {
  attemptId?: unknown;
  ticks?: unknown;
  log?: { dirs?: unknown; perks?: unknown };
}

/** Rejects anything that is not a plausible input log, before spending CPU on a replay. */
export function parseLog(body: FinishBody): { ticks: number; log: ReplayLog } {
  const ticks = body.ticks;
  if (!Number.isInteger(ticks) || (ticks as number) < 0 || (ticks as number) > MAX_RUN_TICKS) throw new HttpError(400, 'bad_ticks');
  const t = ticks as number;
  const dirsRaw = body.log?.dirs;
  const perksRaw = body.log?.perks;
  if (!Array.isArray(dirsRaw) || !Array.isArray(perksRaw)) throw new HttpError(400, 'bad_log');
  if (dirsRaw.length > Math.min(t + 1, 20_000) || perksRaw.length > 2) throw new HttpError(400, 'bad_log');
  let prev = -1;
  const dirs: ReplayLog['dirs'] = [];
  for (const d of dirsRaw) {
    if (!Array.isArray(d) || d.length !== 2) throw new HttpError(400, 'bad_log');
    const [at, code] = d as [unknown, unknown];
    if (!Number.isInteger(at) || (at as number) < prev || (at as number) > t) throw new HttpError(400, 'bad_log');
    if (!Number.isInteger(code) || (code as number) < 0 || (code as number) > 4) throw new HttpError(400, 'bad_log');
    prev = at as number;
    dirs.push([at as number, code as InputCode]);
  }
  const perks: ReplayLog['perks'] = [];
  for (const p of perksRaw) {
    if (!Array.isArray(p) || p.length !== 2) throw new HttpError(400, 'bad_log');
    const [at, id] = p as [unknown, unknown];
    if (!Number.isInteger(at) || (at as number) < 0 || (at as number) > t || typeof id !== 'string' || !PERK_IDS.has(id)) throw new HttpError(400, 'bad_log');
    perks.push([at as number, id]);
  }
  return { ticks: t, log: { dirs, perks } };
}

export interface FinishResult {
  score: number;
  stages: number;
  rank: number;
  best: number;
  date: string;
}

export function verifiedScore(att: Attempt, seed: number, ticks: number, log: ReplayLog): { score: number; stages: number } {
  const run = replayRun({ mode: 'daily', seed, weekday: att.weekday, dateKey: att.date, adaptive: 1, level: att.level }, log, MAX_RUN_TICKS, ticks);
  return { score: Math.round(run.totalScore * LEVELS[att.level].score), stages: run.stagesCleared };
}

export async function finishDaily(redis: Redis, user: User, body: FinishBody, secret: string, now: number): Promise<FinishResult> {
  const att = user.att;
  if (user.banned) throw new HttpError(403, 'banned');
  if (!att || att.id !== body.attemptId) throw new HttpError(409, 'no_attempt');
  if (att.status === 'done') {
    // the same finish arriving twice (retry, keepalive + normal submit) gets the same answer
    return { score: att.score ?? 0, stages: att.stages ?? 0, rank: att.rank ?? 0, best: user.best, date: att.date };
  }
  if (now - att.startedAt > FINISH_WINDOW_MS) throw new HttpError(410, 'attempt_expired');
  const { ticks, log } = parseLog(body);
  if (ticks / TICK_HZ > (now - att.startedAt) / 1000 + CLOCK_SLACK_SECONDS) throw new HttpError(422, 'too_fast');

  const { score, stages } = verifiedScore(att, dailySeed(att.date, secret), ticks, log);
  const best = Math.max(user.best, score);
  const days = [...user.days.filter((d) => d.d !== att.date), { d: att.date, s: score }]
    .filter((d) => daysBetween(d.d, att.date) < 30)
    .slice(-30);
  const done: Attempt = { ...att, status: 'done', score, stages };
  const reply = await redis.multi([
    ['ZADD', K.daily(att.date), 'GT', score, user.sub],
    ['EXPIRE', K.daily(att.date), 8 * 86_400],
    ['ZADD', K.alltime, 'GT', score, user.sub],
    ['ZREVRANK', K.daily(att.date), user.sub],
  ]);
  const rank = Number(reply[3]) + 1;
  await redis.cmd(['HSET', K.user(user.sub), 'att', JSON.stringify({ ...done, rank }), 'best', best, 'days', JSON.stringify(days)]);
  return { score, stages, rank, best, date: att.date };
}
