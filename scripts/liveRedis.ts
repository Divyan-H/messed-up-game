/**
 * Connects the maintenance scripts (admin, backup, restore) to the live Upstash database, using
 * environment variables or a git-ignored .env.local written by
 * `npx vercel env pull .env.local --environment=production`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { readEnv } from '../server/env';
import { UpstashRedis } from '../server/redis';

export function liveRedis(): UpstashRedis {
  if (existsSync('.env.local')) {
    for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^"|"$/g, '');
    }
  }
  const env = readEnv(process.env);
  if (!env.redisUrl || !env.redisToken) {
    console.error('No Upstash credentials. Run `npx vercel env pull .env.local --environment=production` first.');
    process.exit(1);
  }
  return new UpstashRedis(env.redisUrl, env.redisToken);
}
