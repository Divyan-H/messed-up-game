/**
 * Streak reminders over Web Push, with no library: pushes carry no payload (so nothing needs
 * encrypting) and are authorised with a VAPID JWT signed by an ES256 key derived from the server
 * secret. The service worker fetches /api/me when a push arrives and writes the notification itself.
 */
import { createECDH, createHash, createHmac, createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { streakStatus } from '../src/services/streak';
import { serverDate } from './daily';
import { HttpError } from './http';
import { hashFromReply, type Redis } from './redis';
import { getUser, K } from './store';

const P256_ORDER = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
const MAX_DEVICES = 5;
/** Push services we will POST to. Anything else is refused, so the cron cannot be pointed at other hosts. */
const PUSH_HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];

export interface Vapid {
  /** Uncompressed P-256 public key, base64url: the browser's applicationServerKey. */
  publicKey: string;
  privateKey: KeyObject;
}

const vapidCache = new Map<string, Vapid>();

export function vapidKeys(secret: string): Vapid {
  const hit = vapidCache.get(secret);
  if (hit) return hit;
  const seed = BigInt(`0x${createHmac('sha256', `vapid|${secret}`).digest('hex')}`);
  const d = Buffer.from(((seed % (P256_ORDER - 1n)) + 1n).toString(16).padStart(64, '0'), 'hex');
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(d);
  const pub = ecdh.getPublicKey();
  const privateKey = createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: d.toString('base64url'), x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33, 65).toString('base64url') },
    format: 'jwk',
  });
  const keys = { publicKey: pub.toString('base64url'), privateKey };
  vapidCache.set(secret, keys);
  return keys;
}

export function vapidAuthorization(endpoint: string, vapid: Vapid, subject: string, now: number): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ typ: 'JWT', alg: 'ES256' })}.${b64({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })}`;
  const sig = sign('sha256', Buffer.from(unsigned), { key: vapid.privateKey, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${unsigned}.${sig.toString('base64url')}, k=${vapid.publicKey}`;
}

export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function parseSubscription(raw: unknown): PushSubscriptionJson {
  const s = raw as Partial<PushSubscriptionJson> | null;
  let url: URL;
  try {
    url = new URL(String(s?.endpoint));
  } catch {
    throw new HttpError(400, 'bad_subscription');
  }
  const ok = url.protocol === 'https:' && String(s?.endpoint).length < 1024 && PUSH_HOSTS.some((re) => re.test(url.hostname));
  const keys = s?.keys;
  if (!ok || typeof keys?.p256dh !== 'string' || typeof keys.auth !== 'string' || keys.p256dh.length > 200 || keys.auth.length > 100) {
    throw new HttpError(400, 'bad_subscription');
  }
  return { endpoint: url.href, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

const deviceKey = (endpoint: string): string => createHash('sha256').update(endpoint).digest('base64url').slice(0, 22);

export async function addSubscription(redis: Redis, sub: string, s: PushSubscriptionJson): Promise<void> {
  const count = Number(await redis.cmd(['HLEN', K.push(sub)]));
  const key = deviceKey(s.endpoint);
  if (count >= MAX_DEVICES) {
    const existing = await redis.cmd<number>(['HEXISTS', K.push(sub), key]);
    if (!existing) throw new HttpError(409, 'too_many_devices');
  }
  await redis.multi([['HSET', K.push(sub), key, JSON.stringify(s)], ['SADD', K.pushers, sub]]);
}

export async function removeSubscription(redis: Redis, sub: string, endpoint: string): Promise<void> {
  const [, left] = (await redis.multi([['HDEL', K.push(sub), deviceKey(endpoint)], ['HLEN', K.push(sub)]])) as [number, number];
  if (Number(left) === 0) await redis.cmd(['SREM', K.pushers, sub]);
}

export interface ReminderReport {
  checked: number;
  reminded: number;
  sent: number;
  removed: number;
  failed: number;
}

/**
 * Daily cron: remind everyone who has a streak to lose and has not played today. Dead subscriptions
 * (the browser unsubscribed, or the key changed) are deleted.
 */
export async function sendReminders(redis: Redis, secret: string, subject: string, now: number, fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<ReminderReport> {
  const today = serverDate(now);
  const vapid = vapidKeys(secret);
  const report: ReminderReport = { checked: 0, reminded: 0, sent: 0, removed: 0, failed: 0 };
  const subs = ((await redis.cmd<string[]>(['SMEMBERS', K.pushers])) ?? []).map(String);
  for (const sub of subs) {
    report.checked++;
    const user = await getUser(redis, sub);
    if (!user) {
      await redis.multi([['DEL', K.push(sub)], ['SREM', K.pushers, sub]]);
      continue;
    }
    const status = streakStatus(user.streak, today);
    if (user.streak.current <= 0 || (status !== 'alive' && status !== 'saved-by-freeze')) continue;
    report.reminded++;
    const devices = hashFromReply(await redis.cmd(['HGETALL', K.push(sub)]));
    for (const [key, raw] of Object.entries(devices)) {
      let endpoint = '';
      try {
        endpoint = (JSON.parse(raw) as PushSubscriptionJson).endpoint;
        const res = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { authorization: vapidAuthorization(endpoint, vapid, subject, now), ttl: '43200', urgency: 'normal' },
          body: new Uint8Array(0),
        });
        if (res.ok) report.sent++;
        else if (res.status === 404 || res.status === 410 || res.status === 403) {
          await redis.cmd(['HDEL', K.push(sub), key]);
          report.removed++;
        } else report.failed++;
      } catch {
        report.failed++;
      }
    }
    if (Number(await redis.cmd(['HLEN', K.push(sub)])) === 0) await redis.cmd(['SREM', K.pushers, sub]);
  }
  return report;
}
