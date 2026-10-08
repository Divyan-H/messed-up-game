/**
 * HTTP API. One handler serves every route (vercel.json rewrites /api/<route> to it):
 *
 *   GET    /api/me                current player (or null), server time, today's status
 *   PATCH  /api/me                change nickname
 *   DELETE /api/me                delete the account and its scores
 *   POST   /api/auth              sign in with a Google ID token -> session cookie
 *   DELETE /api/auth              sign out (this device)
 *   POST   /api/auth/everywhere   sign out on every device
 *   POST   /api/daily/start       begin today's ranked attempt
 *   POST   /api/daily/finish      submit the input log; the server replays it and records the score
 *   GET    /api/leaderboard       board=daily|alltime|streak (cached at the CDN for 30 s)
 *   GET    /api/push/key          Web Push public key
 *   POST   /api/push/subscribe    turn on streak reminders for this device (DELETE turns them off)
 *   POST   /api/report            browser error report
 *   GET    /api/health            monitoring summary            (Bearer CRON_SECRET)
 *   GET    /api/cron/reminders    daily streak reminders (cron) (Bearer CRON_SECRET)
 */
import { timingSafeEqual } from 'node:crypto';
import { addDays, daysBetween, weekdayOf } from '../src/core/clock';
import { nicknameProblem } from '../src/services/nickname';
import { displayStreak, streakStatus } from '../src/services/streak';
import { finishDaily, serverDate, startDaily, type FinishBody } from './daily';
import type { ServerEnv } from './env';
import { verifyGoogleIdToken } from './google';
import { assertSameOrigin, clientIp, HttpError, json, readJson } from './http';
import { health, recordError } from './monitor';
import { addSubscription, parseSubscription, removeSubscription, sendReminders, vapidKeys } from './push';
import type { Redis } from './redis';
import { clearSessionCookie, sessionCookie, sessionFromRequest, signSession } from './session';
import { bumpSessionVersion, createUser, DAILY_BOARD_DAYS, deleteUser, getUser, K, rateLimit, renameUser, type User } from './store';

export interface Deps {
  env: ServerEnv;
  redis: Redis | null;
  now?: () => number;
  fetchImpl?: typeof fetch;
  /** Called after every request (index.ts flushes the command counter here). */
  afterRequest?: () => Promise<void>;
}

const BOARD_SIZE = 20;

function routeOf(req: Request): string {
  const url = new URL(req.url);
  const q = url.searchParams.get('route');
  if (q) return q;
  return url.pathname.replace(/^\/api\//, '').replace(/\/$/, '').replaceAll('/', '-');
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

/** The signed-in player, or null. A cookie from before "sign out everywhere" no longer counts. */
async function currentUser(req: Request, deps: Deps, redis: Redis, now: number): Promise<{ user: User | null; hadCookie: boolean }> {
  const session = sessionFromRequest(req, deps.env.secret!, now);
  if (!session) return { user: null, hadCookie: false };
  const user = await getUser(redis, session.sub);
  return { user: user && user.sv === session.v ? user : null, hadCookie: true };
}

async function requireUser(req: Request, deps: Deps, redis: Redis, now: number): Promise<User> {
  const { user } = await currentUser(req, deps, redis, now);
  if (!user) throw new HttpError(401, 'signed_out');
  return user;
}

function requireCron(req: Request, env: ServerEnv): void {
  if (!env.cronSecret) throw new HttpError(503, 'cron_not_configured');
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${env.cronSecret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new HttpError(401, 'unauthorized');
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
    const { user, hadCookie } = await currentUser(req, deps, redis, now);
    const headers: Record<string, string> = hadCookie && !user ? { 'set-cookie': clearSessionCookie() } : {};
    return json(await meView(redis, user, now), 200, headers);
  }

  if (r === 'me' && m === 'DELETE') {
    const user = await requireUser(req, deps, redis, now);
    const body = await readJson<{ confirm?: unknown }>(req);
    if (body.confirm !== 'DELETE') throw new HttpError(400, 'confirm_required');
    const today = serverDate(now);
    const recent = Array.from({ length: DAILY_BOARD_DAYS + 1 }, (_, i) => addDays(today, -i));
    await deleteUser(redis, user, recent);
    return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
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
    return json(await meView(redis, user, now), 200, { 'set-cookie': sessionCookie(signSession(sub, env.secret, now, user.sv)) });
  }

  if (r === 'auth' && m === 'DELETE') return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });

  if (r === 'auth-everywhere' && m === 'POST') {
    const user = await requireUser(req, deps, redis, now);
    await bumpSessionVersion(redis, user.sub);
    return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
  }

  if (r === 'push-key' && m === 'GET') {
    return json({ key: vapidKeys(env.secret).publicKey }, 200, { 'cache-control': 'public, max-age=3600' });
  }

  if (r === 'push-subscribe' && (m === 'POST' || m === 'DELETE')) {
    const user = await requireUser(req, deps, redis, now);
    const body = await readJson<{ subscription?: unknown; endpoint?: unknown }>(req);
    if (m === 'POST') {
      await rateLimit(redis, 'push', user.sub, 20, 3600);
      await addSubscription(redis, user.sub, parseSubscription(body.subscription));
    } else await removeSubscription(redis, user.sub, String(body.endpoint ?? ''));
    return json({ ok: true });
  }

  if (r === 'report' && m === 'POST') {
    await rateLimit(redis, 'report', clientIp(req), 20, 3600);
    const body = await readJson<{ message?: unknown; where?: unknown }>(req, 8 * 1024);
    await recordError(redis, { t: now, src: 'client', msg: String(body.message ?? '').slice(0, 300), where: String(body.where ?? '').slice(0, 200) });
    return json({ ok: true });
  }

  if (r === 'health' && m === 'GET') {
    requireCron(req, env);
    return json(await health(redis, now));
  }

  if (r === 'cron-reminders' && m === 'GET') {
    requireCron(req, env);
    return json(await sendReminders(redis, env.secret, env.siteUrl, now, deps.fetchImpl));
  }

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
      if (deps.redis) await recordError(deps.redis, { t: (deps.now ?? Date.now)(), src: 'server', msg: String((e as Error)?.stack ?? e), where: `${req.method} ${routeOf(req)}` });
      return json({ error: 'server_error' }, 500);
    } finally {
      await deps.afterRequest?.().catch(() => undefined);
    }
  };
}
