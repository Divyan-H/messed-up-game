/**
 * Streak rules (pure functions, unit tested):
 *  - Play the Daily Run on consecutive days to grow the streak.
 *  - Missing exactly one day is forgiven if you hold a Streak Freeze ("Mess Holiday Pass").
 *  - Every 7th day of streak earns a freeze (max 2 stored).
 *  - Missing more than that resets the streak.
 */
import { daysBetween } from '../core/clock';

export interface StreakState {
  current: number;
  best: number;
  freezes: number;
  lastPlayed: string | null;
  usedFreezeOn: string | null;
}

export const MAX_FREEZES = 2;
export const FREEZE_EVERY = 7;

export const emptyStreak = (): StreakState => ({ current: 0, best: 0, freezes: 0, lastPlayed: null, usedFreezeOn: null });

export type StreakStatus = 'new' | 'played-today' | 'alive' | 'saved-by-freeze' | 'broken';

/** What would happen if the player showed up on `today`? */
export function streakStatus(s: StreakState, today: string): StreakStatus {
  if (!s.lastPlayed) return 'new';
  const gap = daysBetween(s.lastPlayed, today);
  if (gap <= 0) return 'played-today';
  if (gap === 1) return 'alive';
  if (gap === 2 && s.freezes > 0) return 'saved-by-freeze';
  return 'broken';
}

/** Streak number to *display* today (drops to 0 once it can no longer be saved). */
export function displayStreak(s: StreakState, today: string): number {
  return streakStatus(s, today) === 'broken' ? 0 : s.current;
}

export function recordDailyPlay(s: StreakState, today: string): StreakState {
  const status = streakStatus(s, today);
  if (status === 'played-today') return s;
  const next: StreakState = { ...s, lastPlayed: today };
  if (status === 'alive' || status === 'saved-by-freeze') {
    if (status === 'saved-by-freeze') {
      next.freezes -= 1;
      next.usedFreezeOn = today;
    }
    next.current = s.current + 1;
  } else {
    next.current = 1;
  }
  if (next.current % FREEZE_EVERY === 0) next.freezes = Math.min(MAX_FREEZES, next.freezes + 1);
  next.best = Math.max(s.best, next.current);
  return next;
}
