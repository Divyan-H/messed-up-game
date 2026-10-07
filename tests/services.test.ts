import { beforeEach, describe, expect, it } from 'vitest';
import { FallbackLeaderboard, LocalLeaderboard, type LeaderboardProvider, type ScoreEntry } from '../src/services/leaderboard';
import { sanitizeName } from '../src/services/profile';
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

describe('names', () => {
  it('sanitises to the server-accepted character set and length', () => {
    expect(sanitizeName('  <b>Sam!!bar</b> ')).toBe('bSambarb');
    expect(sanitizeName('x'.repeat(30)).length).toBe(12);
  });
});

describe('leaderboards', () => {
  beforeEach(() => {
    // fresh in-memory storage per test
    (globalThis as unknown as { localStorage?: Storage }).localStorage = undefined;
  });
  const e = (name: string, score: number, date = '2026-10-07', streak = 1): ScoreEntry => ({ name, score, stages: 1, streak, date });

  it('local board ranks best score per player and filters by day', async () => {
    const lb = new LocalLeaderboard();
    await lb.submit(e('Ana', 100));
    await lb.submit(e('Ana', 300));
    await lb.submit(e('Bob', 200));
    await lb.submit(e('Old', 999, '2026-10-01'));
    const daily = await lb.top('daily', '2026-10-07', 10);
    expect(daily.map((r) => r.name)).toEqual(['Ana', 'Bob']);
    expect(daily[0]!.score).toBe(300);
    expect((await lb.top('alltime', '2026-10-07', 10))[0]!.name).toBe('Old');
  });

  it('falls back to the local board when the remote fails', async () => {
    const broken: LeaderboardProvider = { submit: async () => { throw new Error('down'); }, top: async () => { throw new Error('down'); } };
    const local = new LocalLeaderboard();
    const lb = new FallbackLeaderboard(broken, local);
    await lb.submit(e('Cy', 50, '2026-11-01'));
    const rows = await lb.top('daily', '2026-11-01', 5);
    expect(rows[0]!.name).toBe('Cy');
    expect(lb.source).toBe('device');
  });
});
