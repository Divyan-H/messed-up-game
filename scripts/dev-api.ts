/**
 * Local API server for development: `npm run dev:api` (port 8787, used through Vite's /api proxy).
 *
 * - Uses real Upstash if UPSTASH_REDIS_REST_URL / _TOKEN are set (e.g. from `vercel env pull`),
 *   otherwise an in-memory Redis that resets on restart.
 * - Real "Sign in with Google" works on http://localhost:5173 once that origin is authorised in the
 *   Google Cloud console. For automated testing it also accepts tokens from POST /__dev/sign-in
 *   (signed by a throwaway local key). None of this file is deployed.
 *
 * `npm run serve:prod` is a pre-deploy check: it serves the production build (dist/) on port 5173 with the
 * security headers from vercel.json, and answers /api with the real deployable bundle (api/game.js) talking
 * to an in-memory Upstash over HTTP. Sign in there with POST /__dev/sign-in (Google sign-in is not wired up).
 */
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { createHandler } from '../server/app';
import { FakeUpstash } from '../server/dev/fakeUpstash';
import { GOOGLE_ISSUERS, readEnv } from '../server/env';
import { UpstashRedis } from '../server/redis';

const PROD = process.argv.includes('--prod');
const PORT = PROD ? 5173 : 8787;
const DEV_ISSUER = 'https://dev-sign-in.local';
const DEV_KID = 'dev-local-key';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const devJwk = { ...publicKey.export({ format: 'jwk' }), kid: DEV_KID, alg: 'RS256', use: 'sig' };

const base = readEnv(process.env);
const fake = base.redisUrl ? null : new FakeUpstash();
const env = {
  ...base,
  secret: base.secret ?? 'local-dev-secret',
  googleIssuers: [...GOOGLE_ISSUERS, DEV_ISSUER],
};
const redis = fake ? new UpstashRedis('http://fake-upstash', 'dev', fake.fetch) : new UpstashRedis(base.redisUrl!, base.redisToken!);

/** Google's real keys plus the local dev key, so both real and test sign-ins verify. */
const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
  const res = await fetch(input, init);
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url !== env.googleJwksUrl) return res;
  const body = (await res.json().catch(() => ({ keys: [] }))) as { keys: unknown[] };
  return new Response(JSON.stringify({ keys: [...body.keys, devJwk] }), { headers: { 'cache-control': 'max-age=300' } });
}) as typeof fetch;

let api: (req: Request) => Promise<Response> = createHandler({ env, redis, fetchImpl });

if (PROD) {
  // the bundle reads its configuration from the environment, exactly as on Vercel
  const upstash = new FakeUpstash();
  await new Promise<void>((done) => createServer(async (req, res) => {
    const out = await upstash.fetch(`http://fake${req.url}`, { method: 'POST', body: (await readBody(req)).toString() });
    res.setHeader('content-type', 'application/json');
    res.end(await out.text());
  }).listen(8079, done));
  process.env.UPSTASH_REDIS_REST_URL = 'http://localhost:8079';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'local-prod-check';
  process.env.TEST_GOOGLE_JWKS_URL = `http://localhost:${PORT}/__dev/jwks`;
  process.env.TEST_GOOGLE_ISSUER = DEV_ISSUER;
  const bundlePath = '../api/game.js';
  const bundle = (await import(bundlePath)) as Record<string, (req: Request) => Promise<Response>>;
  api = (req) => (bundle[req.method] ?? bundle.GET!)(req);
}

function devToken(sub: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', kid: DEV_KID, typ: 'JWT' });
  const body = b64({ iss: DEV_ISSUER, aud: env.googleClientId, sub, iat: now, exp: now + 3600 });
  return `${head}.${body}.${sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url')}`;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const vercelHeaders = (JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> }).headers;

function serveStatic(path: string, res: ServerResponse): void {
  const root = join(process.cwd(), 'dist');
  let file = normalize(join(root, decodeURIComponent(path.split('?')[0]!)));
  if (!file.startsWith(root)) file = join(root, 'index.html');
  if (!existsSync(file) || statSync(file).isDirectory()) file = existsSync(join(file, 'index.html')) ? join(file, 'index.html') : join(root, 'index.html');
  for (const rule of vercelHeaders) {
    if (rule.source === '/(.*)' || path.startsWith(rule.source.replace('(.*)', ''))) for (const h of rule.headers) res.setHeader(h.key, h.value);
  }
  res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
  res.end(readFileSync(file));
}

createServer(async (req, res) => {
  try {
    const path = req.url ?? '/';
    if (path === '/__dev/jwks') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ keys: [devJwk] }));
      return;
    }
    if (req.method === 'POST' && path === '/__dev/sign-in') {
      const { sub } = JSON.parse((await readBody(req)).toString() || '{}') as { sub?: string };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ credential: devToken(sub || 'dev-user') }));
      return;
    }
    if (!path.startsWith('/api/')) {
      if (PROD) serveStatic(path, res);
      else res.writeHead(404).end();
      return;
    }
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const request = new Request(`http://${req.headers.host ?? `localhost:${PORT}`}${path}`, { method: req.method, headers, body: body ? new Uint8Array(body) : undefined });
    const out = await api(request);
    res.statusCode = out.status;
    out.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(Buffer.from(await out.arrayBuffer()));
  } catch (e) {
    console.error(e);
    res.writeHead(500).end();
  }
}).listen(PORT, () => {
  console.log(`API on http://localhost:${PORT}${PROD ? ' (serving dist/ with production headers)' : ''} - redis: ${fake ? 'in-memory' : 'Upstash'}`);
});
