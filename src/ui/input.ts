/** Keyboard, swipe, the on-screen D-pad and the joystick all feed one "desired direction" value. */
import type { InputCode } from '../core/types';

/**
 * Maps a joystick vector to one of the game's four directions, or null inside the dead zone.
 *
 * The maze only allows up/down/left/right, so the stick picks the dominant axis. To stop a thumb
 * resting near a diagonal from flickering between two directions, the current direction is kept until
 * the other axis is clearly stronger (by `stickiness`, i.e. about 51 degrees instead of 45). Pulling
 * the opposite way switches at once.
 */
export function stickDirection(dx: number, dy: number, current: InputCode, deadZone: number, stickiness = 0.25): InputCode | null {
  if (Math.hypot(dx, dy) < deadZone) return null;
  const want: InputCode = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 2 : 4) : dy > 0 ? 3 : 1;
  if (current === 0 || want === current) return want;
  const along = (c: InputCode) => (c === 1 ? -dy : c === 3 ? dy : c === 2 ? dx : -dx);
  const keep = along(current);
  return keep > 0 && keep * (1 + stickiness) >= along(want) ? current : want;
}

const KEY_MAP: Record<string, InputCode> = {
  ArrowUp: 1, KeyW: 1, ArrowRight: 2, KeyD: 2, ArrowDown: 3, KeyS: 3, ArrowLeft: 4, KeyA: 4,
};

export class InputController {
  /** Direction the player wants; persists until changed (Pac-Man style). */
  code: InputCode = 0;
  private anchor: { x: number; y: number } | null = null;
  private stickBase: HTMLElement | null = null;
  private readonly disposers: Array<() => void> = [];

  constructor(
    surface: HTMLElement,
    handlers: { onPause: () => void; onNumber: (n: number) => void },
  ) {
    const key = (e: KeyboardEvent) => {
      const dir = KEY_MAP[e.code];
      if (dir) {
        this.code = dir;
        e.preventDefault();
      } else if (e.code === 'Escape' || e.code === 'KeyP' || e.code === 'Space') {
        handlers.onPause();
        e.preventDefault();
      } else if (e.code >= 'Digit1' && e.code <= 'Digit3') handlers.onNumber(Number(e.code.slice(5)));
    };
    window.addEventListener('keydown', key);
    this.disposers.push(() => window.removeEventListener('keydown', key));

    const down = (e: PointerEvent) => {
      this.anchor = { x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (!this.anchor) return;
      const dx = e.clientX - this.anchor.x;
      const dy = e.clientY - this.anchor.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 16) return;
      this.code = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 2 : 4) : dy > 0 ? 3 : 1;
      this.anchor = { x: e.clientX, y: e.clientY };
    };
    const up = () => {
      this.anchor = null;
    };
    surface.addEventListener('pointerdown', down);
    surface.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    this.disposers.push(() => {
      surface.removeEventListener('pointerdown', down);
      surface.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    });
  }

  /** Wire an on-screen D-pad button. */
  bindButton(btn: HTMLElement, code: InputCode): void {
    const press = (e: Event) => {
      this.code = code;
      e.preventDefault();
    };
    btn.addEventListener('pointerdown', press);
    this.disposers.push(() => btn.removeEventListener('pointerdown', press));
  }

  /**
   * Wire the on-screen joystick. Tapping near the rim turns at once (like a D-pad); touching near the
   * middle and dragging works like a floating stick. The stick's origin follows the thumb when it is
   * dragged past the rim, so reversing never needs a long drag back. Releasing keeps the direction,
   * exactly like the D-pad (the player keeps walking).
   */
  bindJoystick(base: HTMLElement, knob: HTMLElement, onTurn?: () => void): void {
    this.stickBase = base;
    let pointer: number | null = null;
    let origin = { x: 0, y: 0 };
    const geometry = () => {
      const r = base.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, radius: r.width / 2 };
    };
    const update = (x: number, y: number) => {
      const { radius } = geometry();
      let dx = x - origin.x;
      let dy = y - origin.y;
      const len = Math.hypot(dx, dy);
      if (len > radius * 0.6) {
        // follow the thumb so the stick never runs out of travel
        const k = 1 - (radius * 0.6) / len;
        origin = { x: origin.x + dx * k, y: origin.y + dy * k };
        dx = x - origin.x;
        dy = y - origin.y;
      }
      const dir = stickDirection(dx, dy, this.code, radius * 0.18);
      if (dir !== null) {
        if (dir !== this.code) onTurn?.();
        this.code = dir;
        base.dataset.dir = String(dir);
      }
      const shown = Math.min(1, Math.hypot(dx, dy) / (radius * 0.6)) * radius * 0.42;
      const angle = Math.atan2(dy, dx);
      knob.style.setProperty('--kx', `${Math.cos(angle) * shown}px`);
      knob.style.setProperty('--ky', `${Math.sin(angle) * shown}px`);
    };
    const down = (e: PointerEvent) => {
      e.preventDefault();
      pointer = e.pointerId;
      try {
        base.setPointerCapture(e.pointerId); // keep receiving moves when the thumb slides off the stick
      } catch {
        /* the pointer is already gone */
      }
      base.classList.add('active');
      const { cx, cy, radius } = geometry();
      // near the rim: aim from the centre (instant turn); near the middle: float from the touch point
      origin = Math.hypot(e.clientX - cx, e.clientY - cy) > radius * 0.35 ? { x: cx, y: cy } : { x: e.clientX, y: e.clientY };
      update(e.clientX, e.clientY);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      e.preventDefault();
      update(e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      pointer = null;
      base.classList.remove('active');
      knob.style.setProperty('--kx', '0px');
      knob.style.setProperty('--ky', '0px');
    };
    base.addEventListener('pointerdown', down);
    base.addEventListener('pointermove', move);
    base.addEventListener('pointerup', up);
    base.addEventListener('pointercancel', up);
    this.disposers.push(() => {
      base.removeEventListener('pointerdown', down);
      base.removeEventListener('pointermove', move);
      base.removeEventListener('pointerup', up);
      base.removeEventListener('pointercancel', up);
    });
  }

  reset(): void {
    this.code = 0;
    if (this.stickBase) delete this.stickBase.dataset.dir;
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
  }
}
