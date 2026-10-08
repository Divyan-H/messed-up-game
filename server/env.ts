/** Server configuration, read from environment variables (set in the Vercel dashboard). */
import { createHash } from 'node:crypto';
import { GOOGLE_CLIENT_ID } from '../src/services/authConfig';

export interface ServerEnv {
  redisUrl: string | null;
  redisToken: string | null;
  googleClientId: string;
  /** Overrides for local testing only; ignored in production. */
  googleJwksUrl: string;
  googleIssuers: string[];
  /** Signs session cookies and derives the secret daily seed. */
  secret: string | null;
  /** Bearer token for the reminder cron and the health check (Vercel sends it to cron jobs as CRON_SECRET). */
  cronSecret: string | null;
  /** Public site URL, used as the contact in Web Push (VAPID) requests. */
  siteUrl: string;
  production: boolean;
}

export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
export const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

export function readEnv(env: Record<string, string | undefined> = process.env): ServerEnv {
  const redisUrl = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL ?? null;
  const redisToken = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN ?? null;
  const production = env.VERCEL_ENV === 'production';
  // SESSION_SECRET is optional: without it a key is derived from the (already secret) Redis token,
  // so connecting Upstash is the only setup step.
  const base = env.SESSION_SECRET ?? redisToken;
  return {
    redisUrl,
    redisToken,
    googleClientId: env.GOOGLE_CLIENT_ID ?? GOOGLE_CLIENT_ID,
    googleJwksUrl: (!production && env.TEST_GOOGLE_JWKS_URL) || GOOGLE_JWKS_URL,
    googleIssuers: !production && env.TEST_GOOGLE_ISSUER ? [env.TEST_GOOGLE_ISSUER] : GOOGLE_ISSUERS,
    secret: base ? createHash('sha256').update(`messed-up|${base}`).digest('hex') : null,
    cronSecret: env.CRON_SECRET && env.CRON_SECRET.length >= 16 ? env.CRON_SECRET : null,
    siteUrl: `https://${env.VERCEL_PROJECT_PRODUCTION_URL ?? 'messed-up-game.vercel.app'}`,
    production,
  };
}
