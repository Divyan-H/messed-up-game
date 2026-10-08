import { describe, expect, it } from 'vitest';
import { stickDirection } from '../src/ui/input';

const UP = 1, RIGHT = 2, DOWN = 3, LEFT = 4;
const DEAD = 10;
const at = (deg: number, len = 50) => [Math.cos((deg * Math.PI) / 180) * len, Math.sin((deg * Math.PI) / 180) * len] as const;

describe('joystick: 360 degrees in, four directions out', () => {
  it('ignores small movements inside the dead zone', () => {
    expect(stickDirection(...at(0, 9), 0, DEAD)).toBeNull();
    expect(stickDirection(...at(123, 9), RIGHT, DEAD)).toBeNull();
  });

  it('picks the nearest of the four directions (screen y grows downwards)', () => {
    expect(stickDirection(...at(0), 0, DEAD)).toBe(RIGHT);
    expect(stickDirection(...at(90), 0, DEAD)).toBe(DOWN);
    expect(stickDirection(...at(180), 0, DEAD)).toBe(LEFT);
    expect(stickDirection(...at(-90), 0, DEAD)).toBe(UP);
    expect(stickDirection(...at(-30), 0, DEAD)).toBe(RIGHT);
    expect(stickDirection(...at(-60), 0, DEAD)).toBe(UP);
  });

  it('does not flicker near a diagonal: the current direction holds until the other axis clearly wins', () => {
    // heading right, thumb drifts to 48 and 50 degrees above the horizontal: still right
    expect(stickDirection(...at(-48), RIGHT, DEAD)).toBe(RIGHT);
    expect(stickDirection(...at(-50), RIGHT, DEAD)).toBe(RIGHT);
    // ...but a clear upward push turns
    expect(stickDirection(...at(-55), RIGHT, DEAD)).toBe(UP);
    // and once turned up, coming back to 50 degrees stays up (no ping-pong)
    expect(stickDirection(...at(-50), UP, DEAD)).toBe(UP);
  });

  it('reverses immediately, with no hysteresis against the opposite direction', () => {
    expect(stickDirection(...at(180), RIGHT, DEAD)).toBe(LEFT);
    expect(stickDirection(...at(-90), DOWN, DEAD)).toBe(UP);
    expect(stickDirection(...at(150), RIGHT, DEAD)).toBe(LEFT);
  });

  it('sweeping a full circle visits each direction once, in order', () => {
    const seen: number[] = [];
    let cur: 0 | 1 | 2 | 3 | 4 = 0;
    for (let deg = -45 + 1; deg <= 315; deg += 3) {
      const d = stickDirection(...at(deg), cur, DEAD);
      if (d !== null && d !== cur) {
        seen.push(d);
        cur = d;
      }
    }
    expect(seen).toEqual([RIGHT, DOWN, LEFT, UP]);
  });
});
