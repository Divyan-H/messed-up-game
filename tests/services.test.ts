import { afterEach, describe, expect, it, vi } from 'vitest';
import { Account, type MeResponse } from '../src/services/account';
import { nicknameProblem, randomNickname } from '../src/services/nickname';
import { displayStreak, emptyStreak, recordDailyPlay, streakStatus } from '../src/services/streak';

describe('streaks', () => {
  it('grows on consecutive days and ignores a second play the same day', () => {
    let s = recordDailyPlay(emptyStreak(), '2026-10-01');
    s = recordDailyPlay(s, '2026-10-02');
    s = recordDailyPlay(s, '2026-10-02');
    expect(s.current).toBe(2);
  });
  it('resets after a missed day without a freeze', () => {
    let s = recordDailyPlay(emptyStreak(), '2026-10-01');
    s = recordDailyPlay(s, '2026-10-03');
    expect(s.current).toBe(1);
    expect(s.best).toBe(1);
  });
  it('earns a freeze every 7 days and spends it to save one missed day', () => {
    let s = emptyStreak();
    for (let d = 1; d <= 7; d++) s = recordDailyPlay(s, `2026-10-0${d}`);
    expect(s.current).toBe(7);
    expect(s.freezes).toBe(1);
    expect(streakStatus(s, '2026-10-09')).toBe('saved-by-freeze');
    s = recordDailyPlay(s, '2026-10-09');
    expect(s.current).toBe(8);
    expect(s.freezes).toBe(0);
    expect(streakStatus(s, '2026-10-12')).toBe('broken');
    expect(displayStreak(s, '2026-10-12')).toBe(0);
  });
  it('caps stored freezes at 2', () => {
    let s = emptyStreak();
    for (let d = 0; d < 21; d++) s = recordDailyPlay(s, new Date(Date.UTC(2026, 9, 1 + d)).toISOString().slice(0, 10));
    expect(s.freezes).toBe(2);
  });
});

describe('nicknames', () => {
  it('accepts 3-14 letters, numbers, _ and -', () => {
    expect(nicknameProblem('MessKing')).toBeNull();
    expect(nicknameProblem('ab')).not.toBeNull();
    expect(nicknameProblem('has space')).not.toBeNull();
    expect(nicknameProblem('x'.repeat(15))).not.toBeNull();
  });
  it('generates valid random names', () => {
    for (let i = 0; i < 200; i++) expect(nicknameProblem(randomNickname())).toBeNull();
  });
});

describe('account (client side of ranked play)', () => {
  const me = (over: Partial<MeResponse> = {}): MeResponse => ({ serverNow: Date.UTC(2026, 9, 7, 6), today: '2026-10-07', weekday: 3, user: { name: 'Ana', best: 0, streak: { current: 1, best: 1, freezes: 0, status: 'played-today' }, days: [], today: null }, ...over });
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const payload = { attemptId: 'att1', ticks: 100, log: { dirs: [], perks: [] } };
  afterEach(() => vi.unstubAllGlobals());

  it('goes offline (not an error screen) when the API has no database yet', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(503, { error: 'not_configured' })));
    const a = new Account();
    await a.load();
    expect(a.state).toBe('offline');
    expect(a.offline).toBe('not_configured');
  });

  it('uses the server clock for the game day, whatever the device clock says', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, me())));
    const a = new Account();
    await a.load();
    expect(a.today()).toBe('2026-10-07');
    expect(Math.abs(a.now() - Date.UTC(2026, 9, 7, 6))).toBeLessThan(5000);
  });

  it('keeps a run that could not be submitted and sends it on the next visit', async () => {
    const a = new Account();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await expect(a.finishDaily(payload)).rejects.toThrow();
    expect(a.hasPending()).toBe(true);
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      return url.includes('finish') ? reply(200, { score: 10, stages: 0, rank: 1, best: 10, date: '2026-10-07' }) : reply(200, me());
    }));
    await a.load();
    expect(calls).toContain('/api/daily/finish');
    expect(a.hasPending()).toBe(false);
  });

  it('drops a pending run the server has rejected for good', async () => {
    const a = new Account();
    vi.stubGlobal('fetch', vi.fn(async () => reply(409, { error: 'no_attempt' })));
    await expect(a.finishDaily(payload)).rejects.toThrow();
    expect(a.hasPending()).toBe(false);
  });
});
