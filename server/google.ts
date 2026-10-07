/**
 * Verifies a Google Sign-In ID token (an RS256 JWT) without any third-party library:
 * the signature is checked against Google's published keys (cached per their Cache-Control),
 * then the issuer, audience (our client ID) and expiry are checked.
 */
import { createPublicKey, verify, type KeyObject } from 'node:crypto';
import { HttpError } from './http';

export interface GoogleIdentity {
  sub: string;
}

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

type Fetch = typeof fetch;

const SKEW_SECONDS = 60;
const keyCache = new Map<string, { keys: Map<string, KeyObject>; until: number }>();

async function loadKeys(url: string, now: number, fetchImpl: Fetch, force = false): Promise<Map<string, KeyObject>> {
  const hit = keyCache.get(url);
  if (hit && hit.until > now && !force) return hit.keys;
  const res = await fetchImpl(url);
  if (!res.ok) throw new HttpError(502, 'google_keys_unavailable');
  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = new Map<string, KeyObject>();
  for (const jwk of body.keys ?? []) {
    if (jwk.kty !== 'RSA' || !jwk.kid) continue;
    keys.set(jwk.kid, createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' }));
  }
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600);
  keyCache.set(url, { keys, until: now + Math.min(maxAge, 24 * 3600) * 1000 });
  return keys;
}

const b64json = (part: string): Record<string, unknown> => {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new HttpError(401, 'bad_token');
  }
};

export async function verifyGoogleIdToken(
  token: string,
  opts: { clientId: string; jwksUrl: string; issuers: string[]; now?: number; fetchImpl?: Fetch },
): Promise<GoogleIdentity> {
  const now = opts.now ?? Date.now();
  const fetchImpl = opts.fetchImpl ?? ((...a) => fetch(...a));
  if (typeof token !== 'string' || token.length > 4096) throw new HttpError(400, 'bad_token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new HttpError(401, 'bad_token');
  const [h, p, s] = parts as [string, string, string];
  const header = b64json(h);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new HttpError(401, 'bad_token');

  let keys = await loadKeys(opts.jwksUrl, now, fetchImpl);
  if (!keys.has(header.kid)) keys = await loadKeys(opts.jwksUrl, now, fetchImpl, true); // Google rotated keys
  const key = keys.get(header.kid);
  if (!key) throw new HttpError(401, 'unknown_key');
  const ok = verify('RSA-SHA256', Buffer.from(`${h}.${p}`), key, Buffer.from(s, 'base64url'));
  if (!ok) throw new HttpError(401, 'bad_signature');

  const claims = b64json(p);
  const sec = now / 1000;
  const aud = claims.aud;
  if (!opts.issuers.includes(String(claims.iss))) throw new HttpError(401, 'bad_issuer');
  if (Array.isArray(aud) ? !aud.includes(opts.clientId) : aud !== opts.clientId) throw new HttpError(401, 'bad_audience');
  if (typeof claims.exp !== 'number' || claims.exp + SKEW_SECONDS < sec) throw new HttpError(401, 'expired');
  if (typeof claims.iat === 'number' && claims.iat - SKEW_SECONDS > sec) throw new HttpError(401, 'not_yet_valid');
  if (typeof claims.sub !== 'string' || !/^[\w-]{1,255}$/.test(claims.sub)) throw new HttpError(401, 'bad_subject');
  return { sub: claims.sub };
}

/** Test hook: forget cached keys. */
export function clearGoogleKeyCache(): void {
  keyCache.clear();
}
