import { generateKeyPairSync, sign as rsaSign } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { botRun } from '../src/game/bot';
import { LEVELS, type Level } from '../src/game/difficulty';
import { createHandler } from '../server/app';
import { dailySeed, parseLog } from '../server/daily';
import { FakeUpstash } from '../server/dev/fakeUpstash';
import { readEnv } from '../server/env';
import { clearGoogleKeyCache } from '../server/google';
import { isNicknameAllowed } from '../server/moderation';
import { UpstashRedis } from '../server/redis';
import { readSession, signSession } from '../server/session';

const ORIGIN = 'https://game.test';
const ISSUER = 'https://issuer.test';
const JWKS = 'https://keys.test/certs';
const START = Date.UTC(2026, 9, 7, 6, 0, 0); // 11:30 IST, Wednesday 2026-10-07

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const { privateKey: otherKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const keysFetch = (async () =>
  new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'cache-control': 'public, max-age=3600' } })) as unknown as typeof fetch;

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function idToken(claims: Record<string, unknown>, key = privateKey, kid = 'k1'): string {
  const head = b64({ alg: 'RS256', kid, typ: 'JWT' });
  const body = b64(claims);
  return `${head}.${body}.${rsaSign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url')}`;
}

let clock = START;
let fake: FakeUpstash;
let api: (req: Request) => Promise<Response>;
const env = readEnv({
  UPSTASH_REDIS_REST_URL: 'https://redis.test',
  UPSTASH_REDIS_REST_TOKEN: 'secret-token',
  TEST_GOOGLE_JWKS_URL: JWKS,
  TEST_GOOGLE_ISSUER: ISSUER,
});
const claimsFor = (sub: string, extra: Record<string, unknown> = {}) => ({
  iss: ISSUER, aud: env.googleClientId, sub, iat: Math.floor(clock / 1000), exp: Math.floor(clock / 1000) + 3600, ...extra,
});

async function call(method: string, path: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}) {
  const res = await api(new Request(`${ORIGIN}${path}`, {
    method,
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...(cookie ? { cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  const setCookie = res.headers.get('set-cookie');
  return { status: res.status, body: (await res.json()) as Record<string, any>, cookie: setCookie?.split(';')[0], headers: res.headers };
}

async function signIn(sub: string) {
  const r = await call('POST', '/api/auth', { credential: idToken(claimsFor(sub)) });
  expect(r.status).toBe(200);
  return r.cookie!;
}

/** Plays a real Daily Run with the bot on the seed the server handed out. */
function playDaily(seed: number, level: Level = 'normal', weekday = 3, date = '2026-10-07') {
  const run = botRun({ mode: 'daily', seed, weekday, dateKey: date, adaptive: 1, level });
  return { run, expected: Math.round(run.totalScore * LEVELS[level].score) };
}

beforeEach(() => {
  clock = START;
  clearGoogleKeyCache();
  fake = new FakeUpstash(() => clock);
  api = createHandler({ env, redis: new UpstashRedis('https://redis.test', 'secret-token', fake.fetch), now: () => clock, fetchImpl: keysFetch });
});

describe('api: setup and sign-in', () => {
  it('answers 503 until Upstash is connected', async () => {
    const bare = createHandler({ env: readEnv({}), redis: null });
    const res = await bare(new Request(`${ORIGIN}/api/me`));
    expect(res.status).toBe(503);
  });

  it('reports a signed-out player with the server date', async () => {
    const r = await call('GET', '/api/me');
    expect(r.status).toBe(200);
    expect(r.body.user).toBeNull();
    expect(r.body.today).toBe('2026-10-07');
    expect(r.body.weekday).toBe(3);
  });

  it('signs in with a valid Google token, creates a unique nickname once, and sets a session cookie', async () => {
    const r = await call('POST', '/api/auth', { credential: idToken(claimsFor('alice')) });
    expect(r.status).toBe(200);
    expect(r.cookie).toMatch(/^mu_s=/);
    expect(r.headers.get('set-cookie')).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    const name = r.body.user.name;
    expect(name).toMatch(/^[A-Za-z0-9_-]{3,14}$/);
    const again = await call('POST', '/api/auth', { credential: idToken(claimsFor('alice')) });
    expect(again.body.user.name).toBe(name);
    const me = await call('GET', '/api/me', undefined, r.cookie);
    expect(me.body.user.name).toBe(name);
  });

  it.each([
    ['wrong audience', () => idToken(claimsFor('x', { aud: 'someone-else.apps.googleusercontent.com' })), 'bad_audience'],
    ['wrong issuer', () => idToken(claimsFor('x', { iss: 'https://evil.test' })), 'bad_issuer'],
    ['expired', () => idToken(claimsFor('x', { exp: Math.floor(clock / 1000) - 600 })), 'expired'],
    ['signed by another key', () => idToken(claimsFor('x'), otherKey), 'bad_signature'],
    ['unknown key id', () => idToken(claimsFor('x'), privateKey, 'nope'), 'unknown_key'],
    ['garbage', () => 'not.a.token', 'bad_token'],
  ])('rejects a token that is %s', async (_label, make, code) => {
    const r = await call('POST', '/api/auth', { credential: make() });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.body.error).toBe(code);
  });

  it('rejects a payload that was edited after Google signed it', async () => {
    const [h, , s] = idToken(claimsFor('alice')).split('.');
    const forged = `${h}.${b64(claimsFor('admin'))}.${s}`;
    expect((await call('POST', '/api/auth', { credential: forged })).body.error).toBe('bad_signature');
  });

  it('blocks cross-site requests (CSRF) and non-JSON posts', async () => {
    expect((await call('POST', '/api/auth', { credential: 'x' }, undefined, { origin: 'https://evil.test' })).status).toBe(403);
    const res = await api(new Request(`${ORIGIN}/api/auth`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' }));
    expect(res.status).toBe(415);
  });

  it('rate-limits sign-in attempts per IP', async () => {
    let last = 0;
    for (let i = 0; i < 22; i++) last = (await call('POST', '/api/auth', { credential: 'x.y.z' }, undefined, { 'x-forwarded-for': '1.2.3.4' })).status;
    expect(last).toBe(429);
  });

  it('ignores a tampered or expired session cookie', async () => {
    const cookie = await signIn('alice');
    const [name, value] = cookie.split('=') as [string, string];
    const tampered = `${name}=${decodeURIComponent(value).replace(/^./, 'x')}`;
    expect((await call('GET', '/api/me', undefined, tampered)).body.user).toBeNull();
    clock += 31 * 86_400_000;
    expect((await call('GET', '/api/me', undefined, cookie)).body.user).toBeNull();
  });

  it('sessions round-trip and expire', () => {
    const t = signSession('bob', 'k', START);
    expect(readSession(t, 'k', START)).toBe('bob');
    expect(readSession(t, 'other-key', START)).toBeNull();
    expect(readSession(t, 'k', START + 31 * 86_400_000)).toBeNull();
  });
});

describe('api: nicknames', () => {
  it('renames, keeps names unique (case-insensitive) and frees the old one', async () => {
    const a = await signIn('alice');
    const b = await signIn('bob');
    expect((await call('PATCH', '/api/me', { name: 'MessKing' }, a)).body.user.name).toBe('MessKing');
    const taken = await call('PATCH', '/api/me', { name: 'messking' }, b);
    expect(taken.status).toBe(409);
    expect(taken.body.error).toBe('name_taken');
    await call('PATCH', '/api/me', { name: 'MessQueen' }, a);
    expect((await call('PATCH', '/api/me', { name: 'MessKing' }, b)).status).toBe(200);
  });

  it('rejects bad characters and blocked words', async () => {
    const a = await signIn('alice');
    expect((await call('PATCH', '/api/me', { name: '<b>hi</b>' }, a)).status).toBe(422);
    expect((await call('PATCH', '/api/me', { name: 'F_u_c_k3r' }, a)).body.error).toBe('name_not_allowed');
  });

  it('moderation catches disguises without blocking innocent food names', () => {
    for (const bad of ['FuCk_99', 'sh1t', 'b1tchy', 'Admin', 'chutiya7', 'Rapey']) expect(isNicknameAllowed(bad)).toBe(false);
    for (const ok of ['GrapeJuice', 'Peacock', 'SpicyIdli123', 'Cucumber', 'MessKing']) expect(isNicknameAllowed(ok)).toBe(true);
  });

  it('rate-limits renames', async () => {
    const a = await signIn('alice');
    let last = 0;
    for (let i = 0; i < 8; i++) last = (await call('PATCH', '/api/me', { name: `Name${i}x` }, a)).status;
    expect(last).toBe(429);
  });
});

describe('api: the ranked Daily Run', () => {
  it('requires sign-in', async () => {
    expect((await call('POST', '/api/daily/start', { level: 'normal' })).status).toBe(401);
  });

  it('allows one attempt per account per day, even from a second device', async () => {
    const a = await signIn('alice');
    const first = await call('POST', '/api/daily/start', { level: 'normal' }, a);
    expect(first.status).toBe(200);
    expect(first.body.date).toBe('2026-10-07');
    expect(first.body.seed).toBe(dailySeed('2026-10-07', env.secret!));
    const otherDevice = await signIn('alice');
    const second = await call('POST', '/api/daily/start', { level: 'easy' }, otherDevice);
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('already_played');
  });

  it('keeps the daily maze secret: the seed depends on the server secret, not just the date', () => {
    expect(dailySeed('2026-10-08', 'a')).not.toBe(dailySeed('2026-10-08', 'b'));
    expect(dailySeed('2026-10-08', 'a')).toBe(dailySeed('2026-10-08', 'a'));
  });

  it('scores a run by replaying its inputs, ignoring any score the client claims', async () => {
    const a = await signIn('alice');
    const start = (await call('POST', '/api/daily/start', { level: 'hard' }, a)).body;
    const { run, expected } = playDaily(start.seed, 'hard');
    clock += (run.tickCount / 60) * 1000 + 2000;
    const fin = await call('POST', '/api/daily/finish', { attemptId: start.attemptId, ticks: run.tickCount, log: run.log, score: 999_999 }, a);
    expect(fin.status).toBe(200);
    expect(fin.body.score).toBe(expected);
    expect(fin.body.rank).toBe(1);
    const board = await call('GET', '/api/leaderboard?board=daily');
    expect(board.body.entries[0]).toEqual({ name: (await call('GET', '/api/me', undefined, a)).body.user.name, score: expected });
    expect(board.headers.get('cache-control')).toContain('s-maxage=30');
  });

  it('rejects a run submitted faster than it could have been played', async () => {
    const a = await signIn('alice');
    const start = (await call('POST', '/api/daily/start', { level: 'normal' }, a)).body;
    const { run } = playDaily(start.seed);
    clock += 5000;
    const fin = await call('POST', '/api/daily/finish', { attemptId: start.attemptId, ticks: run.tickCount, log: run.log }, a);
    expect(fin.status).toBe(422);
    expect(fin.body.error).toBe('too_fast');
  });

  it('answers a repeated finish with the same result and never re-scores it', async () => {
    const a = await signIn('alice');
    const start = (await call('POST', '/api/daily/start', { level: 'normal' }, a)).body;
    const { run, expected } = playDaily(start.seed);
    clock += (run.tickCount / 60) * 1000 + 1000;
    const body = { attemptId: start.attemptId, ticks: run.tickCount, log: run.log };
    const one = await call('POST', '/api/daily/finish', body, a);
    const two = await call('POST', '/api/daily/finish', { ...body, log: { dirs: [], perks: [] } }, a);
    expect(one.body.score).toBe(expected);
    expect(two.body.score).toBe(expected);
  });

  it('scores a quit part-way through by replaying only up to that tick', async () => {
    const a = await signIn('alice');
    const start = (await call('POST', '/api/daily/start', { level: 'normal' }, a)).body;
    const { run } = playDaily(start.seed);
    const cut = Math.floor(run.tickCount / 3);
    const partial = botRun({ mode: 'daily', seed: start.seed, weekday: 3, dateKey: '2026-10-07', adaptive: 1, level: 'normal' }, cut);
    clock += (cut / 60) * 1000 + 1000;
    const fin = await call('POST', '/api/daily/finish', { attemptId: start.attemptId, ticks: partial.tickCount, log: partial.log }, a);
    expect(fin.body.score).toBe(partial.totalScore);
  });

  it('refuses malformed logs before replaying anything', () => {
    const bad = [
      { ticks: -1, log: { dirs: [], perks: [] } },
      { ticks: 10, log: { dirs: [[5, 1], [3, 2]], perks: [] } },
      { ticks: 10, log: { dirs: [[1, 9]], perks: [] } },
      { ticks: 10, log: { dirs: [], perks: [[1, 'god-mode']] } },
      { ticks: 10, log: { dirs: 'x', perks: [] } },
      { ticks: 10_000_000, log: { dirs: [], perks: [] } },
    ];
    for (const b of bad) expect(() => parseLog(b as never)).toThrow();
  });

  it('expires attempts that are finished too late', async () => {
    const a = await signIn('alice');
    const start = (await call('POST', '/api/daily/start', { level: 'normal' }, a)).body;
    clock += 40 * 3600 * 1000;
    const fin = await call('POST', '/api/daily/finish', { attemptId: start.attemptId, ticks: 0, log: { dirs: [], perks: [] } }, a);
    expect(fin.status).toBe(410);
  });

  it('grows the streak on the server across days and resets after a gap', async () => {
    const a = await signIn('alice');
    for (let d = 0; d < 3; d++) {
      expect((await call('POST', '/api/daily/start', { level: 'normal' }, a)).status).toBe(200);
      clock += 86_400_000;
    }
    let me = (await call('GET', '/api/me', undefined, a)).body.user;
    expect(me.streak.current).toBe(3);
    clock += 2 * 86_400_000;
    me = (await call('GET', '/api/me', undefined, a)).body.user;
    expect(me.streak.current).toBe(0);
    const streakBoard = await call('GET', '/api/leaderboard?board=streak');
    expect(streakBoard.body.entries[0].score).toBe(3);
  });
});

describe('api: leaderboard requests', () => {
  it('only answers canonical URLs, so junk parameters cannot bypass the CDN cache', async () => {
    expect((await call('GET', '/api/leaderboard?board=daily&x=1')).status).toBe(400);
    expect((await call('GET', '/api/leaderboard?board=nope')).status).toBe(400);
    expect((await call('GET', '/api/leaderboard?board=daily&date=2026-10-08')).status).toBe(400);
    expect((await call('GET', '/api/leaderboard?board=daily&date=2026-10-06')).status).toBe(200);
    expect((await call('GET', '/api/leaderboard?board=alltime&date=2026-10-07')).status).toBe(400);
  });

  it('routes rewritten requests (?route=) the same as direct paths', async () => {
    expect((await call('GET', '/api/game?route=leaderboard&board=alltime')).status).toBe(200);
    expect((await call('GET', '/api/game?route=nope')).status).toBe(404);
  });
});
