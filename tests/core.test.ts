import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, formatCountdown, istDateKey, msUntilNextIstMidnight, weekdayOf } from '../src/core/clock';
import { MinHeap } from '../src/core/heap';
import { hashString, mulberry32, shuffle } from '../src/core/rng';

describe('rng', () => {
  it('is deterministic per seed and differs between seeds', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const seqA = Array.from({ length: 5 }, a);
    expect(seqA).toEqual(Array.from({ length: 5 }, b));
    expect(seqA).not.toEqual(Array.from({ length: 5 }, c));
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
  });
  it('hashString is stable', () => {
    expect(hashString('messedup-2026-10-07')).toBe(hashString('messedup-2026-10-07'));
    expect(hashString('a')).not.toBe(hashString('b'));
  });
  it('shuffle keeps all elements', () => {
    const arr = [1, 2, 3, 4, 5, 6];
    expect(shuffle([...arr], mulberry32(1)).sort()).toEqual(arr);
  });
});

describe('clock (IST day boundaries)', () => {
  it('rolls over at 18:30 UTC', () => {
    expect(istDateKey(Date.parse('2026-10-07T18:29:59Z'))).toBe('2026-10-07');
    expect(istDateKey(Date.parse('2026-10-07T18:30:00Z'))).toBe('2026-10-08');
  });
  it('counts down to the next IST midnight', () => {
    expect(msUntilNextIstMidnight(Date.parse('2026-10-07T18:29:00Z'))).toBe(60_000);
    expect(formatCountdown(3_723_000)).toBe('01:02:03');
  });
  it('date arithmetic and weekdays', () => {
    expect(weekdayOf('2026-10-07')).toBe(3); // Wednesday
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(daysBetween('2026-10-01', '2026-10-04')).toBe(3);
  });
});

describe('MinHeap', () => {
  it('pops in ascending key order', () => {
    const h = new MinHeap(64);
    [5, 1, 9, 3, 7, 2, 8].forEach((k) => h.push(k, k * 10));
    const out: number[] = [];
    while (!h.isEmpty) out.push(h.pop());
    expect(out).toEqual([10, 20, 30, 50, 70, 80, 90]);
  });
});
