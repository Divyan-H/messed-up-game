/**
 * The signed-in player, as the server sees them. Ranked play (Daily Run, streak, leaderboard) lives
 * on the server; guests can still play Practice, which stays entirely on the device.
 */
import { istDateKey, weekdayOf } from '../core/clock';
import { loadJson, saveJson } from '../core/storage';
import type { Level } from '../game/difficulty';
import type { ReplayLog } from '../game/run';
import type { StreakStatus } from './streak';
import { ApiError, apiRequest } from './api';

export interface DayResult {
  d: string;
  s: number;
}

export interface TodayStatus {
  status: 'started' | 'done';
  attemptId: string;
  level: Level;
  score: number;
  stages: number;
  rank: number;
}

export interface Player {
  name: string;
  best: number;
  streak: { current: number; best: number; freezes: number; status: StreakStatus };
  days: DayResult[];
  today: TodayStatus | null;
}

export interface MeResponse {
  serverNow: number;
  today: string;
  weekday: number;
  user: Player | null;
}

export interface DailyStart {
  attemptId: string;
  date: string;
  weekday: number;
  level: Level;
  seed: number;
  me: MeResponse;
}

export interface DailyFinish {
  score: number;
  stages: number;
  rank: number;
  best: number;
  date: string;
}

export interface FinishPayload {
  attemptId: string;
  ticks: number;
  log: ReplayLog;
}

export type AccountState = 'loading' | 'ready' | 'offline';

const PENDING_KEY = 'messedup:pending-finish:v1';

export class Account {
  state: AccountState = 'loading';
  /** Why ranked play is unavailable: the API has no database yet, or the network failed. */
  offline: 'not_configured' | 'network' | null = null;
  me: MeResponse | null = null;
  private offset = 0;
  private readonly listeners = new Set<() => void>();

  get user(): Player | null {
    return this.me?.user ?? null;
  }

  /** Server-corrected time, so device clock changes do not move the game day. */
  now(): number {
    return Date.now() + this.offset;
  }

  today(): string {
    return this.me?.today ?? istDateKey(this.now());
  }

  weekday(): number {
    return this.me?.weekday ?? weekdayOf(this.today());
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of [...this.listeners]) fn();
  }

  private set(me: MeResponse): void {
    this.me = me;
    this.offset = me.serverNow - Date.now();
    this.state = 'ready';
    this.offline = null;
    this.emit();
  }

  private fail(e: unknown): void {
    this.state = 'offline';
    this.offline = e instanceof ApiError && e.status === 503 ? 'not_configured' : 'network';
    this.emit();
  }

  async load(): Promise<void> {
    try {
      this.set(await apiRequest<MeResponse>('/api/me'));
      await this.flushPending();
    } catch (e) {
      this.fail(e);
    }
  }

  async signIn(credential: string): Promise<void> {
    this.set(await apiRequest<MeResponse>('/api/auth', { method: 'POST', body: { credential } }));
    await this.flushPending();
  }

  async signOut(): Promise<void> {
    await apiRequest('/api/auth', { method: 'DELETE' }).catch(() => undefined);
    if (this.me) this.set({ ...this.me, user: null });
  }

  async rename(name: string): Promise<void> {
    this.set(await apiRequest<MeResponse>('/api/me', { method: 'PATCH', body: { name } }));
  }

  async startDaily(level: Level): Promise<DailyStart> {
    const res = await apiRequest<DailyStart>('/api/daily/start', { method: 'POST', body: { level } });
    this.set(res.me);
    return res;
  }

  /** Sends the run for verification. It is kept on the device until the server confirms it. */
  async finishDaily(payload: FinishPayload): Promise<DailyFinish> {
    saveJson(PENDING_KEY, payload);
    try {
      const res = await apiRequest<DailyFinish>('/api/daily/finish', { method: 'POST', body: payload, timeoutMs: 20_000 });
      saveJson(PENDING_KEY, null);
      await this.load();
      return res;
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 429) saveJson(PENDING_KEY, null);
      throw e;
    }
  }

  /** Page is closing mid-run: send what was played so far (kept for a retry if it does not arrive). */
  finishOnExit(payload: FinishPayload): void {
    saveJson(PENDING_KEY, payload);
    void apiRequest('/api/daily/finish', { method: 'POST', body: payload, keepalive: true }).catch(() => undefined);
  }

  hasPending(): boolean {
    return !!loadJson<FinishPayload | null>(PENDING_KEY, null)?.attemptId;
  }

  private async flushPending(): Promise<void> {
    const pending = loadJson<Partial<FinishPayload> | null>(PENDING_KEY, null);
    if (!pending?.attemptId || !this.user) return;
    try {
      await this.finishDaily(pending as FinishPayload);
    } catch {
      /* finishDaily already decided whether to keep it for later */
    }
  }
}
