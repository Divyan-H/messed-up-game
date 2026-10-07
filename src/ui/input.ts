/** Keyboard, swipe and on-screen D-pad all feed one "desired direction" value. */
import type { InputCode } from '../core/types';

const KEY_MAP: Record<string, InputCode> = {
  ArrowUp: 1, KeyW: 1, ArrowRight: 2, KeyD: 2, ArrowDown: 3, KeyS: 3, ArrowLeft: 4, KeyA: 4,
};

export class InputController {
  /** Direction the player wants; persists until changed (Pac-Man style). */
  code: InputCode = 0;
  private anchor: { x: number; y: number } | null = null;
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

  reset(): void {
    this.code = 0;
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
  }
}
