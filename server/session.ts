/**
 * Stateless session cookie: `<base64url payload>.<HMAC-SHA256>` holding the Google account ID, an expiry
 * and the account's session version. Costs no database reads to verify; tampering breaks the signature.
 * "Sign out everywhere" bumps the account's version, which invalidates every cookie issued before it.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookie, parseCookies } from './http';

export const SESSION_COOKIE = 'mu_s';
export const SESSION_DAYS = 30;

export interface Session {
  sub: string;
  /** Session version the cookie was issued under (see User.sv). */
  v: number;
}

const mac = (secret: string, payload: string): Buffer => createHmac('sha256', `session|${secret}`).update(payload).digest();

export function signSession(sub: string, secret: string, now = Date.now(), version = 0): string {
  const payload = Buffer.from(JSON.stringify({ s: sub, e: Math.floor(now / 1000) + SESSION_DAYS * 86_400, v: version })).toString('base64url');
  return `${payload}.${mac(secret, payload).toString('base64url')}`;
}

export function readSession(token: string | undefined, secret: string, now = Date.now()): Session | null {
  if (!token || token.length > 1024) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const want = mac(secret, payload);
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { s?: unknown; e?: unknown; v?: unknown };
    if (typeof data.s !== 'string' || typeof data.e !== 'number' || data.e < now / 1000) return null;
    return { sub: data.s, v: typeof data.v === 'number' ? data.v : 0 };
  } catch {
    return null;
  }
}

export function sessionFromRequest(req: Request, secret: string, now = Date.now()): Session | null {
  return readSession(parseCookies(req.headers.get('cookie'))[SESSION_COOKIE], secret, now);
}

export const sessionCookie = (token: string): string => cookie(SESSION_COOKIE, token, SESSION_DAYS * 86_400);
export const clearSessionCookie = (): string => cookie(SESSION_COOKIE, '', 0);
