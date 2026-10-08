/**
 * Regenerates the README screenshots in docs/screens (`npm run build && npm run screens`).
 *
 * Starts the production check server (`serve:prod`: dist/ + the real API bundle + in-memory database),
 * signs in a test account, seeds a demo leaderboard, then drives headless Edge or Chrome over the
 * DevTools protocol (no extra packages) and captures each screen at desktop and phone sizes.
 * Set BROWSER_PATH if the browser is not found automatically, and SCREENS_DEBUG=1 to log the protocol traffic.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SITE = 'http://localhost:5173';
const PORT = 9333;
const OUT = 'docs/screens';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const BROWSERS = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/microsoft-edge',
].filter((p): p is string => !!p);

async function waitFor(url: string, tries = 60): Promise<Response> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${url}`);
}

/** Minimal DevTools-protocol client: one WebSocket, replies matched to requests by id. */
class Cdp {
  private id = 0;
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  private constructor(private readonly ws: WebSocket) {
    ws.onmessage = (ev) => {
      if (process.env.SCREENS_DEBUG) console.log('<-', String(ev.data).slice(0, 160));
      const msg = JSON.parse(String(ev.data)) as { id?: number; result?: unknown; error?: { message: string } };
      const p = msg.id === undefined ? undefined : this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id!);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    };
  }

  static async connect(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    await new Promise<void>((ok, fail) => {
      ws.onopen = () => ok();
      ws.onerror = () => fail(new Error('could not connect to the browser'));
    });
    return new Cdp(ws);
  }

  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<unknown> {
    const id = ++this.id;
    if (process.env.SCREENS_DEBUG) console.log('->', id, method, sessionId ?? '');
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

/** One browser tab driven over the protocol. */
class Page {
  private constructor(
    private readonly cdp: Cdp,
    private readonly session: string,
  ) {}

  static async open(cdp: Cdp): Promise<Page> {
    const { targetId } = (await cdp.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
    const { sessionId } = (await cdp.send('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string };
    return new Page(cdp, sessionId);
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return this.cdp.send(method, params, this.session);
  }

  async eval<T = unknown>(expression: string): Promise<T> {
    const r = (await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })) as {
      result: { value?: T };
      exceptionDetails?: { text: string; exception?: { description?: string } };
    };
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value as T;
  }

  async viewport(width: number, height: number, mobile: boolean): Promise<void> {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
    await this.send('Emulation.setTouchEmulationEnabled', mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  }

  async goto(path: string): Promise<void> {
    await this.send('Page.navigate', { url: `${SITE}${path}` });
    await sleep(500);
    for (let i = 0; i < 60; i++) {
      const ready = await this.eval<boolean>(`document.readyState === 'complete' && !!document.querySelector('#screen > *') && !document.body.innerText.includes('CONNECTING')`).catch(() => false);
      if (ready) break;
      await sleep(200);
    }
    await sleep(900); // fonts, sprites, fit-to-screen
  }

  click(text: string): Promise<void> {
    return this.eval(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); if (!b) throw new Error('no button ' + ${JSON.stringify(text)}); b.click(); })()`);
  }

  async shot(name: string): Promise<void> {
    const { data } = (await this.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
    console.log(`  ${name}.png`);
  }
}

async function main(): Promise<void> {
  if (!existsSync('dist/index.html')) throw new Error('Run `npm run build` first.');
  const browser = BROWSERS.find((p) => existsSync(p));
  if (!browser) throw new Error('No Edge or Chrome found. Set BROWSER_PATH.');
  mkdirSync(OUT, { recursive: true });
  const children: ChildProcess[] = [];
  const profile = mkdtempSync(join(tmpdir(), 'mu-shots-'));
  const stopAll = () => children.forEach((c) => c.kill());
  process.on('exit', stopAll);
  for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => process.exit(1));
  const busy = await fetch(`${SITE}/`).then(() => true, () => false);
  if (busy) throw new Error('Port 5173 is already in use. Stop the dev server (or serve:prod) first.');
  try {
    console.log('Starting the local production server...');
    children.push(spawn(process.execPath, ['--import', 'tsx', 'scripts/dev-api.ts', '--prod'], { stdio: 'ignore' }));
    await waitFor(`${SITE}/api/me`);
    console.log(`Starting ${browser}...`);
    children.push(spawn(browser, [
      '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
      '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
      '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank',
    ], { stdio: 'ignore' }));
    const { webSocketDebuggerUrl } = (await (await waitFor(`http://127.0.0.1:${PORT}/json/version`)).json()) as { webSocketDebuggerUrl: string };
    const cdp = await Cdp.connect(webSocketDebuggerUrl);
    console.log('Connected to the browser.');
    const page = await Page.open(cdp);
    await page.send('Page.enable');
    await page.send('Runtime.enable');

    // a signed-in player with a 6-day streak, a nickname, and a full demo leaderboard
    await page.viewport(1280, 800, false);
    await page.goto('/');
    await page.eval(`(async () => {
      const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const { credential } = await (await post('/__dev/sign-in', { sub: 'screenshot-player' })).json();
      await post('/api/auth', { credential });
      await fetch('/api/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'SaucyRice42' }) });
      await post('/__dev/seed', { me: 'screenshot-player' });
      const p = JSON.parse(localStorage.getItem('messedup:profile:v1') || '{}');
      localStorage.setItem('messedup:profile:v1', JSON.stringify({ ...p, tourSeen: true, runs: 23, totalFood: 412, achievements: ['first', 'immunity', 'maggi'] }));
    })()`);

    console.log('Capturing:');
    await page.goto('/');
    await page.shot('title');

    await page.click('HALL OF FAME');
    await sleep(1200);
    await page.click('ALL-TIME');
    await sleep(1200);
    await page.shot('hall');

    await page.goto('/');
    await page.click('SETTINGS');
    await sleep(900);
    await page.shot('settings');

    await page.goto('/');
    await page.click('AI LAB');
    await sleep(500);
    await page.click('RUN');
    await sleep(1500);
    await page.shot('ai-lab');

    await page.goto('/');
    await page.click('PRACTICE');
    await sleep(600);
    await page.eval(`document.querySelectorAll('.day-btn')[2].click()`);
    await sleep(1000);
    await page.shot('menu-card');

    // gameplay: the bot plays Practice (autopilot only works there)
    await page.goto('/?autopilot');
    await page.click('PRACTICE');
    await sleep(500);
    await page.eval(`document.querySelectorAll('.day-btn')[2].click()`);
    await sleep(600);
    await page.click('START PRACTICE');
    await sleep(7000);
    await page.shot('gameplay');

    // the same with the enemy-path overlay
    await page.eval(`(() => { const p = JSON.parse(localStorage.getItem('messedup:profile:v1')); p.settings = { ...(p.settings ?? {}), showPaths: true }; localStorage.setItem('messedup:profile:v1', JSON.stringify(p)); })()`);
    await page.goto('/?autopilot');
    await page.click('PRACTICE');
    await sleep(500);
    await page.eval(`document.querySelectorAll('.day-btn')[4].click()`);
    await sleep(600);
    await page.click('START PRACTICE');
    await sleep(6000);
    await page.shot('ai-paths-overlay');
    await page.eval(`(() => { const p = JSON.parse(localStorage.getItem('messedup:profile:v1')); p.settings = { ...(p.settings ?? {}), showPaths: false }; localStorage.setItem('messedup:profile:v1', JSON.stringify(p)); })()`);

    // phone
    await page.viewport(390, 844, true);
    await page.goto('/');
    await page.shot('title-mobile');
    await page.goto('/?autopilot');
    await page.click('PRACTICE');
    await sleep(500);
    await page.eval(`document.querySelectorAll('.day-btn')[1].click()`);
    await sleep(600);
    await page.click('START PRACTICE');
    await sleep(6000);
    await page.shot('gameplay-mobile');

    // the same phone with the joystick instead of the D-pad
    await page.eval(`(() => { const p = JSON.parse(localStorage.getItem('messedup:profile:v1')); p.settings = { ...(p.settings ?? {}), touchControl: 'joystick' }; localStorage.setItem('messedup:profile:v1', JSON.stringify(p)); })()`);
    await page.goto('/?autopilot');
    await page.click('PRACTICE');
    await sleep(500);
    await page.eval(`document.querySelectorAll('.day-btn')[3].click()`);
    await sleep(600);
    await page.click('START PRACTICE');
    await sleep(6000);
    await page.shot('gameplay-joystick');

    await cdp.send('Browser.close').catch(() => undefined);
  } finally {
    for (const c of children) c.kill();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  await import('./sharecard');
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
