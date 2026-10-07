/**
 * First-time guided tour: dims the page, spotlights one element at a time and explains it in a small card.
 * Every step has a SKIP button (and Esc). Used for both the title screen and the first game.
 */
import { sfx } from '../audio/sfx';
import { button, h } from './dom';

export interface TourStep {
  /** Where to point. Return null to drop the step (hidden or missing element). */
  target: () => DOMRect | null;
  title: string;
  text: string;
}

export interface TourHandle {
  close: () => void;
}

const PAD = 6;

export function runTour(steps: TourStep[], opts: { onEnd: (skipped: boolean) => void }): TourHandle {
  // drop steps whose target is missing or invisible right now
  const live = steps.filter((s) => {
    const r = s.target();
    return !!r && r.width > 0 && r.height > 0;
  });
  if (!live.length) {
    opts.onEnd(false);
    return { close: () => undefined };
  }

  let i = 0;
  let closed = false;
  const spot = h('div', { class: 'tour-spot' });
  const count = h('div', { class: 'tour-count' });
  const title = h('div', { class: 'tour-title' });
  const text = h('div', { class: 'tour-text' });
  const back = button('BACK', () => go(i - 1), 'small ghost');
  const next = button('NEXT', () => go(i + 1), 'small primary');
  const skip = button('SKIP TOUR', () => finish(true), 'small linkish');
  const card = h('div', { class: 'tour-card', role: 'dialog', 'aria-live': 'polite' },
    h('div', { class: 'tour-head' }, title, count), text,
    h('div', { class: 'tour-btns' }, skip, back, next));
  const layer = h('div', { class: 'tour-layer' }, spot, card);

  const place = () => {
    const r = live[i]!.target();
    if (!r) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = Math.max(0, r.left - PAD);
    const y = Math.max(0, r.top - PAD);
    const w = Math.min(vw - x, r.width + PAD * 2);
    const hh = Math.min(vh - y, r.height + PAD * 2);
    Object.assign(spot.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${hh}px` });
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const gap = 12;
    let top = y + hh + gap;
    if (top + ch > vh - 8) top = y - ch - gap; // no room below: go above
    if (top < 8) top = Math.max(8, Math.min(vh - ch - 8, y + hh / 2 - ch / 2)); // neither fits: overlap the target's middle
    const left = Math.max(8, Math.min(vw - cw - 8, x + w / 2 - cw / 2));
    Object.assign(card.style, { left: `${left}px`, top: `${top}px` });
  };

  const show = () => {
    const s = live[i]!;
    title.textContent = s.title;
    text.textContent = s.text;
    count.textContent = `${i + 1}/${live.length}`;
    back.disabled = i === 0;
    next.textContent = i === live.length - 1 ? 'GOT IT!' : 'NEXT';
    place();
  };

  function go(n: number): void {
    if (closed) return;
    if (n >= live.length) return finish(false);
    if (n < 0) return;
    sfx.click();
    i = n;
    show();
  }

  function finish(skipped: boolean, silent = false): void {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', place);
    layer.remove();
    if (!silent) opts.onEnd(skipped);
  }

  const onKey = (e: KeyboardEvent) => {
    // swallow every key so the game underneath never steers while the tour is open
    e.stopImmediatePropagation();
    if (e.code === 'Escape') {
      e.preventDefault();
      finish(true);
    } else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'ArrowRight') {
      e.preventDefault();
      go(i + 1);
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      go(i - 1);
    }
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', place);
  document.body.append(layer);
  show();
  next.focus({ preventScroll: true });
  return { close: () => finish(false, true) };
}
