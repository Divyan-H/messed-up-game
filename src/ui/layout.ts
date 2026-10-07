/**
 * Responsive shell. Measures the viewport and publishes two things as attributes/variables on the shell:
 *   --ui          a UI scale factor (1 on phones, fitted to the screen (0.8 to 2.5), times the player's text-size setting)
 *   data-layout   "tall" (stacked HUD / board / pad) or "wide" (board on the left, HUD + pad in a side column)
 * All CSS sizes for text and the window derive from these, so the game fits phones, tablets and monitors.
 */
import type { TextSize } from '../services/profile';

const MAX_UI = 2.5;
export const TEXT_SCALE: Record<TextSize, number> = { small: 0.9, medium: 1, large: 1.2 };

export interface LayoutInfo {
  ui: number;
  layout: 'tall' | 'wide';
}

/** Pure, so it can be unit-tested without a browser. */
export function computeLayout(width: number, height: number, text: TextSize = 'medium'): LayoutInfo {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const wide = w >= 600 && w / h >= 1.15;
  // Fit the window's design size (wide 1000x720, tall 480x900) to the viewport, minus the 8px page padding.
  // Wide layouts shrink below 1 so a laptop viewport fits; landscape phones (short) keep 1 and use the compact CSS.
  const auto = wide
    ? h < 520 ? 1 : Math.min(MAX_UI, Math.max(0.8, Math.min((w - 16) / 1000, (h - 16) / 720)))
    : Math.min(MAX_UI, Math.max(1, Math.min(w / 390, h / 700)));
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

/** Candidate layout widths (CSS px) a page may be laid out at before being scaled to the viewport. */
export const FIT_WIDTHS = [380, 480, 600, 760, 940, 1120, 1360, 1640] as const;
const MAX_FIT = 3;
/** Pages switch to tabs below this width (matches the 700px container query in CSS). */
const TABS_BELOW = 700;

/**
 * Picks the layout width whose content, scaled uniformly, fills the viewport best. `heightAt(w)` is the
 * natural content height when laid out `w` px wide. Pure, so it is unit-testable without a browser.
 */
export function chooseFit(availW: number, availH: number, heightAt: (w: number) => number): { width: number; scale: number } {
  let best = { width: FIT_WIDTHS[0] as number, scale: 0 };
  // Landscape screens always get the wide layout (every card visible); tabs are for portrait phones.
  const minW = availW >= 720 && availW / availH >= 1.05 ? TABS_BELOW : 0;
  for (const w of FIT_WIDTHS) {
    if (w < minW) continue;
    const hh = Math.max(1, heightAt(w));
    const scale = Math.min(MAX_FIT, availW / w, availH / hh);
    if (scale > best.scale + 0.001) best = { width: w, scale };
  }
  return best;
}

/**
 * Scales `inner` (a menu page) so the whole page is visible without scrolling at any viewport size.
 * Re-fits on viewport changes and whenever the page content changes. Returns a cleanup function.
 */
export function mountFit(host: HTMLElement, inner: HTMLElement, textScale: () => number): () => void {
  let raf = 0;
  let busy = false;
  let lastW = 0;
  let lastH = 0;
  const run = (force: boolean) => {
    raf = 0;
    const aw = host.clientWidth;
    const ah = host.clientHeight;
    if (!aw || !ah) return;
    busy = true;
    inner.style.setProperty('--ui', String(textScale()));
    inner.style.transform = 'none';
    if (!force && inner.offsetHeight === lastH && aw === lastW) {
      inner.style.transform = inner.dataset.t ?? 'none';
      busy = false;
      return;
    }
    const best = chooseFit(aw, ah, (w) => {
      inner.style.width = `${w}px`;
      return inner.offsetHeight;
    });
    inner.style.width = `${best.width}px`;
    lastH = inner.offsetHeight;
    lastW = aw;
    inner.dataset.t = `scale(${best.scale})`;
    inner.style.transform = inner.dataset.t;
    busy = false;
  };
  const schedule = (force: boolean) => {
    if (busy || raf) return;
    raf = requestAnimationFrame(() => run(force));
  };
  const onResize = () => schedule(true);
  const ro = new ResizeObserver(onResize);
  ro.observe(host);
  const mo = new MutationObserver(() => schedule(false));
  mo.observe(inner, { childList: true, subtree: true, characterData: true });
  window.addEventListener('resize', onResize);
  run(true);
  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    mo.disconnect();
    window.removeEventListener('resize', onResize);
  };
}
