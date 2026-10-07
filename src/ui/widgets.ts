/** Small reusable retro controls used by the Settings and menu-preview screens. */
import { sfx } from '../audio/sfx';
import { LEVELS, LEVEL_IDS, type Level } from '../game/difficulty';
import type { App } from './app';
import { button, clear, h } from './dom';

/** A row of mutually exclusive buttons. Keeps its own highlight in sync; calls onPick with the chosen id. */
export function segmented<T extends string>(options: ReadonlyArray<{ id: T; label: string }>, value: T, onPick: (v: T) => void): HTMLElement {
  let current = value;
  const wrap = h('div', { class: 'seg', role: 'group' });
  const paint = () => {
    for (const b of Array.from(wrap.children) as HTMLButtonElement[]) b.classList.toggle('on', b.dataset.id === current);
  };
  for (const o of options) {
    const b = h('button', { class: 'seg-btn', type: 'button', onclick: () => {
      if (current === o.id) return;
      current = o.id;
      sfx.click();
      paint();
      onPick(o.id);
    } }, o.label);
    b.dataset.id = o.id;
    wrap.append(b);
  }
  paint();
  return wrap;
}

/** ON / OFF switch bound to a boolean setting. */
export function toggle(get: () => boolean, set: (v: boolean) => void): HTMLButtonElement {
  const b = button('', () => {
    set(!get());
    sfx.click();
    paint();
  }, 'tog');
  const paint = () => {
    b.textContent = get() ? 'ON' : 'OFF';
    b.classList.toggle('on', get());
    b.setAttribute('aria-pressed', String(get()));
  };
  paint();
  return b;
}

/** Easy / Normal / Hard picker with a one-line description of what the chosen level does. */
export function levelPicker(app: App, onChange?: (l: Level) => void): HTMLElement {
  const blurb = h('p', { class: 'hint left' });
  const show = (l: Level) => {
    clear(blurb);
    blurb.append(`${LEVELS[l].label}: ${LEVELS[l].blurb}`);
  };
  show(app.settings.difficulty);
  const seg = segmented(
    LEVEL_IDS.map((id) => ({ id, label: LEVELS[id].label })),
    app.settings.difficulty,
    (l) => {
      app.setSetting('difficulty', l);
      show(l);
      onChange?.(l);
    },
  );
  return h('div', { class: 'level-picker' }, seg, blurb);
}

/**
 * Groups cards into tabbed panes. On a narrow layout one pane shows at a time (all panes share one grid cell, so the
 * page height never jumps between tabs); on a wide layout every card is shown at once in a grid. See `.paneset` in CSS.
 */
export function paneSet(tabs: ReadonlyArray<{ label: string; nodes: Array<Node | null> }>): HTMLElement {
  const bar = h('div', { class: 'tabs panetabs' });
  const panes = tabs.map((t, i) => h('div', { class: `pane ${i === 0 ? 'on' : ''}` }, ...t.nodes));
  const buttons = tabs.map((t, i) => h('button', {
    class: `tab ${i === 0 ? 'on' : ''}`,
    type: 'button',
    onclick: () => {
      sfx.click();
      buttons.forEach((b, j) => b.classList.toggle('on', i === j));
      panes.forEach((p, j) => p.classList.toggle('on', i === j));
    },
  }, t.label));
  bar.append(...buttons);
  return h('div', { class: 'paneset' }, bar, h('div', { class: 'panes' }, ...panes));
}
