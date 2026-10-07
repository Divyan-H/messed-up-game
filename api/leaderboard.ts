/**
 * Community leaderboard as a Vercel Function (Redis sorted sets via Upstash's REST API).
 *
 * Setup: add the Upstash Redis integration from the Vercel Marketplace; it injects
 * UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (KV_REST_API_* also accepted).
 * Without those variables the endpoint answers 503 and the game silently falls back to
 * the per-device board.
 *
 * Note: with no accounts, scores are self-reported. Validation below stops junk, not a
 * determined cheater (see README "Anti-cheat roadmap" for the replay-verification plan).
 */
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

const MAX_SCORE = 120_000;
const NAME_RE = /^[A-Za-z0-9_ -]{2,12}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

type Cmd = Array<string | number>;

async function redis(cmd: Cmd): Promise<unknown> {
  const res = await fetch(REDIS_URL!, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const json = (await res.json()) as { result?: unknown; error?: string };
  if (!res.ok || json.error) throw new Error(json.error ?? `redis ${res.status}`);
  return json.result;
}

const json = (body: unknown, status = 200, cache = 'no-store'): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': cache } });

const serverDate = (): string => new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
const dayGap = (a: string, b: string): number => Math.abs(Math.round((Date.parse(a) - Date.parse(b)) / DAY_MS));

export async function GET(request: Request): Promise<Response> {
  if (!REDIS_URL || !REDIS_TOKEN) return json({ error: 'not_configured' }, 503);
  const q = new URL(request.url).searchParams;
  const board = q.get('board') ?? 'daily';
  const date = q.get('date') ?? serverDate();
  const limit = Math.min(50, Math.max(1, Number(q.get('limit') ?? 20) || 20));
  if (!DATE_RE.test(date)) return json({ error: 'bad_date' }, 400);
  const key = board === 'daily' ? `mu:daily:${date}` : board === 'streak' ? 'mu:streak' : board === 'alltime' ? 'mu:alltime' : null;
  if (!key) return json({ error: 'bad_board' }, 400);
  try {
    const flat = (await redis(['ZRANGE', key, 0, limit - 1, 'REV', 'WITHSCORES'])) as string[];
    const entries: Array<{ name: string; score: number }> = [];
    for (let i = 0; i + 1 < flat.length; i += 2) entries.push({ name: flat[i]!, score: Number(flat[i + 1]) });
    return json({ entries }, 200, 'public, s-maxage=10, stale-while-revalidate=30');
  } catch {
    return json({ error: 'upstream' }, 502);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!REDIS_URL || !REDIS_TOKEN) return json({ error: 'not_configured' }, 503);
  let body: { name?: unknown; score?: unknown; streak?: unknown; date?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_json' }, 400);
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const score = Number(body.score);
  const streak = Number(body.streak ?? 0);
  const date = typeof body.date === 'string' ? body.date : '';
  if (!NAME_RE.test(name)) return json({ error: 'bad_name' }, 400);
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) return json({ error: 'bad_score' }, 400);
  if (!Number.isInteger(streak) || streak < 0 || streak > 3650) return json({ error: 'bad_streak' }, 400);
  if (!DATE_RE.test(date) || dayGap(date, serverDate()) > 1) return json({ error: 'bad_date' }, 400);
  try {
    const dailyKey = `mu:daily:${date}`;
    await redis(['ZADD', dailyKey, 'GT', score, name]);
    await redis(['EXPIRE', dailyKey, 8 * 24 * 3600]);
    await redis(['ZADD', 'mu:alltime', 'GT', score, name]);
    if (streak > 0) await redis(['ZADD', 'mu:streak', 'GT', streak, name]);
    return json({ ok: true });
  } catch {
    return json({ error: 'upstream' }, 502);
  }
}
