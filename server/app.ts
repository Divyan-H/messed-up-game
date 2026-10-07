/**
 * HTTP API. One handler serves every route (vercel.json rewrites /api/<route> to it):
 *
 *   GET    /api/me             current player (or null), server time, today's status
 *   PATCH  /api/me             change nickname
 *   POST   /api/auth           sign in with a Google ID token -> session cookie
 *   DELETE /api/auth           sign out
 *   POST   /api/daily/start    begin today's ranked attempt
 *   POST   /api/daily/finish   submit the input log; the server replays it and records the score
 *   GET    /api/leaderboard    board=daily|alltime|streak (cached at the CDN for 30 s)
 */
import { daysBetween, weekdayOf } from '../src/core/clock';
import { nicknameProblem } from '../src/services/nickname';
import { displayStreak, streakStatus } from '../src/services/streak';
import { finishDaily, serverDate, startDaily, type FinishBody } from './daily';
import type { ServerEnv } from './env';
import { verifyGoogleIdToken } from './google';
import { assertSameOrigin, clientIp, HttpError, json, readJson } from './http';
import type { Redis } from './redis';
import { clearSessionCookie, sessionCookie, sessionFromRequest, signSession } from './session';
import { createUser, getUser, K, rateLimit, renameUser, type User } from './store';

export interface Deps {
  env: ServerEnv;
  redis: Redis | null;
  now?: () => number;
  fetchImpl?: typeof fetch;
}

const BOARD_SIZE = 20;

function routeOf(req: Request): string {
  const url = new URL(req.url);
  const q = url.searchParams.get('route');
  if (q) return q;
  return url.pathname.replace(/^\/api\//, '').replace(/\/$/, '').replace('/', '-');
}

async function meView(redis: Redis, user: User | null, now: number) {
  const today = serverDate(now);
  const base = { serverNow: now, today, weekday: weekdayOf(today) };
  if (!user) return { ...base, user: null };
  const att = user.att && user.att.date === today ? user.att : null;
  let rank = att?.rank ?? 0;
  if (att?.status === 'done') {
    const r = await redis.cmd<number | null>(['ZREVRANK', K.daily(today), user.sub]);
    if (r !== null) rank = Number(r) + 1;
  }
  return {
    ...base,
    user: {
      name: user.name,
      best: user.best,
      streak: {
        current: displayStreak(user.streak, today),
        best: user.streak.best,
        freezes: user.streak.freezes,
        status: streakStatus(user.streak, today),
      },
      days: user.days,
      today: att ? { status: att.status, attemptId: att.id, level: att.level, score: att.score ?? 0, stages: att.stages ?? 0, rank } : null,
    },
  };
}

async function requireUser(req: Request, deps: Deps, redis: Redis, now: number): Promise<User> {
  const sub = sessionFromRequest(req, deps.env.secret!, now);
  if (!sub) throw new HttpError(401, 'signed_out');
  const user = await getUser(redis, sub);
  if (!user) throw new HttpError(401, 'signed_out');
  return user;
}

async function leaderboard(req: Request, redis: Redis, now: number): Promise<Response> {
  const q = new URL(req.url).searchParams;
  // only canonical URLs are answered, so junk query strings cannot bypass the CDN cache
  for (const k of q.keys()) if (k !== 'board' && k !== 'date' && k !== 'route') throw new HttpError(400, 'bad_param');
  const board = q.get('board');
  const today = serverDate(now);
  let key: string;
  let date: string | null = null;
  if (board === 'daily') {
    date = q.get('date') ?? today;
    // today or yesterday only (yesterday's board stays readable just after midnight)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || ![0, 1].includes(daysBetween(date, today))) throw new HttpError(400, 'bad_date');
    key = K.daily(date);
  } else if (board === 'alltime' && !q.has('date')) key = K.alltime;
  else if (board === 'streak' && !q.has('date')) key = K.streak;
  else throw new HttpError(400, 'bad_board');

  const flat = ((await redis.cmd<string[]>(['ZRANGE', key, 0, BOARD_SIZE - 1, 'REV', 'WITHSCORES'])) ?? []).map(String);
  const subs: string[] = [];
  const scores: number[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    subs.push(flat[i]!);
    scores.push(Number(flat[i + 1]));
  }
  const names = subs.length ? ((await redis.cmd<Array<string | null>>(['HMGET', K.nick, ...subs])) ?? []) : [];
  const entries = subs.map((_, i) => ({ name: names[i] ?? '???', score: scores[i]! }));
  return json({ board, date, entries }, 200, { 'cache-control': 'public, s-maxage=30, stale-while-revalidate=60' });
}

async function route(req: Request, deps: Deps): Promise<Response> {
  const { env, redis } = deps;
  const now = (deps.now ?? Date.now)();
  if (!redis || !env.secret) throw new HttpError(503, 'not_configured');
  const r = routeOf(req);
  const m = req.method;
  if (m !== 'GET' && m !== 'HEAD') assertSameOrigin(req);

  if (r === 'leaderboard' && m === 'GET') return leaderboard(req, redis, now);

  if (r === 'me' && m === 'GET') {
    const sub = sessionFromRequest(req, env.secret, now);
    const user = sub ? await getUser(redis, sub) : null;
    const headers: Record<string, string> = sub && !user ? { 'set-cookie': clearSessionCookie() } : {};
    return json(await meView(redis, user, now), 200, headers);
  }

  if (r === 'me' && m === 'PATCH') {
    const user = await requireUser(req, deps, redis, now);
    const body = await readJson<{ name?: unknown }>(req);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const problem = nicknameProblem(name);
    if (problem) throw new HttpError(422, 'bad_name', { message: problem });
    await rateLimit(redis, 'rename', user.sub, 6, 3600);
    return json(await meView(redis, await renameUser(redis, user, name), now));
  }

  if (r === 'auth' && m === 'POST') {
    await rateLimit(redis, 'auth', clientIp(req), 20, 600);
    const body = await readJson<{ credential?: unknown }>(req);
    const { sub } = await verifyGoogleIdToken(String(body.credential ?? ''), {
      clientId: env.googleClientId,
      jwksUrl: env.googleJwksUrl,
      issuers: env.googleIssuers,
      now,
      fetchImpl: deps.fetchImpl,
    });
    const user = (await getUser(redis, sub)) ?? (await createUser(redis, sub, now));
    return json(await meView(redis, user, now), 200, { 'set-cookie': sessionCookie(signSession(sub, env.secret, now)) });
  }

  if (r === 'auth' && m === 'DELETE') return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });

  if (r === 'daily-start' && m === 'POST') {
    const user = await requireUser(req, deps, redis, now);
    const body = await readJson<{ level?: unknown }>(req);
    const { result, user: next } = await startDaily(redis, user, body.level, env.secret, now);
    return json({ ...result, me: await meView(redis, next, now) });
  }

  if (r === 'daily-finish' && m === 'POST') {
    const user = await requireUser(req, deps, redis, now);
    const body = await readJson<FinishBody>(req, 256 * 1024);
    return json(await finishDaily(redis, user, body, env.secret, now));
  }

  throw new HttpError(404, 'not_found');
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      return await route(req, deps);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, ...e.extra }, e.status);
      console.error('api error', e);
      return json({ error: 'server_error' }, 500);
    }
  };
}
