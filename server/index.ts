/**
 * Vercel Function entry. `npm run build:api` bundles this file (and the game simulation it replays)
 * into api/game.js. Do not edit api/game.js by hand.
 */
import { createHandler } from './app';
import { readEnv } from './env';
import { CountingRedis } from './monitor';
import { UpstashRedis } from './redis';

const env = readEnv();
const redis = env.redisUrl && env.redisToken ? new CountingRedis(new UpstashRedis(env.redisUrl, env.redisToken)) : null;
const handler = createHandler({ env, redis, afterRequest: () => redis?.flush() ?? Promise.resolve() });

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
