/**
 * Responsive shell. Measures the viewport and publishes two things as attributes/variables on the shell:
 *   --ui          a UI scale factor (1 on phones, up to 1.7 on big screens, times the player's text-size setting)
 *   data-layout   "tall" (stacked HUD / board / pad) or "wide" (board on the left, HUD + pad in a side column)
 * All CSS sizes for text and the window derive from these, so the game fits phones, tablets and monitors.
 */
import type { TextSize } from '../services/profile';

export const TEXT_SCALE: Record<TextSize, number> = { small: 0.9, medium: 1, large: 1.2 };

export interface LayoutInfo {
  ui: number;
  layout: 'tall' | 'wide';
}

/** Pure, so it can be unit-tested without a browser. */
export function computeLayout(width: number, height: number, text: TextSize = 'medium'): LayoutInfo {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const auto = Math.min(1.7, Math.max(1, Math.min(w / 390, h / 700)));
  const wide = w >= 600 && w / h >= 1.15;
  return { ui: Math.round(auto * TEXT_SCALE[text] * 100) / 100, layout: wide ? 'wide' : 'tall' };
}

/**
 * Maze scale from the space available. 'fill' uses every pixel; 'crisp' snaps down to whole pixels
 * (sharpest, may leave borders); 'auto' snaps only when that wastes under 10%.
 */
export function fitScale(raw: number, mode: 'auto' | 'fill' | 'crisp'): number {
  if (raw < 1 || mode === 'fill') return raw;
  const whole = Math.floor(raw);
  return mode === 'crisp' || whole / raw >= 0.9 ? whole : raw;
}

export class LayoutController {
  private text: TextSize = 'medium';

  constructor(private readonly shell: HTMLElement) {
    const update = () => this.update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.visualViewport?.addEventListener('resize', update);
    this.update();
  }

  setTextSize(t: TextSize): void {
    this.text = t;
    this.update();
  }

  update(): void {
    const vv = window.visualViewport;
    const info = computeLayout(vv?.width ?? window.innerWidth, vv?.height ?? window.innerHeight, this.text);
    const root = document.documentElement;
    root.style.setProperty('--ui', String(info.ui));
    this.shell.dataset.layout = info.layout;
  }
}
