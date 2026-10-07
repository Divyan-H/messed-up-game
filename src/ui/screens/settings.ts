import { sfx } from '../../audio/sfx';
import type { App, Screen } from '../app';
import { button, h } from '../dom';
import { levelPicker, paneSet, segmented, toggle } from '../widgets';

type BoolKey = Parameters<App['toggleSetting']>[0];

export function settingsScreen(app: App): Screen {
  const s = () => app.settings;

  const row = (label: string, hint: string | null, control: Node) =>
    h('div', { class: 'set-row' }, h('div', { class: 'set-label' }, h('b', {}, label), hint ? h('span', { class: 'dim' }, hint) : null), control);

  const sw = (key: BoolKey) => toggle(() => s()[key], (v) => app.setSetting(key, v));

  const slider = h('input', {
    class: 'slider',
    type: 'range',
    min: '0',
    max: '100',
    step: '5',
    value: String(Math.round(s().volume * 100)),
    'aria-label': 'Volume',
    oninput: (e: Event) => {
      const v = Number((e.target as HTMLInputElement).value) / 100;
      app.setSetting('volume', v);
      readout.textContent = `${Math.round(v * 100)}%`;
    },
    onchange: () => sfx.eat(3),
  });
  const readout = h('span', { class: 'mono vol' }, `${Math.round(s().volume * 100)}%`);

  let armed = false;
  const reset = button('RESET TO DEFAULTS', () => {
    if (!armed) {
      armed = true;
      reset.textContent = 'TAP AGAIN TO CONFIRM';
      window.setTimeout(() => {
        armed = false;
        reset.textContent = 'RESET TO DEFAULTS';
      }, 2500);
      return;
    }
    app.resetSettings();
    sfx.click();
    app.goSettings();
  }, 'ghost');

  const el = h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('h2', { class: 'page-title' }, 'SETTINGS'), h('span', { class: 'dim' }, 'Saved instantly on this device.'), reset, button('BACK', () => { sfx.click(); app.goTitle(); }, 'ghost small')),
    paneSet([

      { label: 'GAMEPLAY', nodes: [h('div', { class: 'card' },
      h('div', { class: 'card-title' }, 'GAMEPLAY'),
      h('div', { class: 'set-label' }, h('b', {}, 'DIFFICULTY'), h('span', { class: 'dim' }, 'Applies to Daily and Practice. Your final score is multiplied, so ranks stay fair.')),
      levelPicker(app),
      row('ADAPTIVE AI', 'Practice only: the game tunes enemy speed to how you play.', sw('adaptive')),
      row('SHOW ENEMY PATHS', 'Draw each enemy\'s A* route on the maze.', sw('showPaths')),
      row('HINT TICKER', 'Funny one-liners under the maze.', sw('tips')),
      row('MENU CARD BEFORE PLAY', 'Show today\'s dishes before each run.', sw('menuPreview')),
    )] },

      { label: 'DISPLAY', nodes: [h('div', { class: 'card' },
      h('div', { class: 'card-title' }, 'DISPLAY'),
      row('CRT SCANLINES', null, sw('crt')),
      row('HIGH CONTRAST', 'Brighter text and edges, no scanlines.', sw('highContrast')),
      row('FONT', 'Clear is easier to read in small sizes.', segmented([{ id: 'pixel', label: 'PIXEL' }, { id: 'clear', label: 'CLEAR' }], s().font, (v) => app.setSetting('font', v))),
      row('TEXT SIZE', null, segmented([{ id: 'small', label: 'S' }, { id: 'medium', label: 'M' }, { id: 'large', label: 'L' }], s().textSize, (v) => app.setSetting('textSize', v))),
      row('MAZE SCALING', 'Auto: crisp when large. Fill: biggest. Crisp: whole pixels.', segmented([{ id: 'auto', label: 'AUTO' }, { id: 'fill', label: 'FILL' }, { id: 'crisp', label: 'CRISP' }], s().scaleMode, (v) => app.setSetting('scaleMode', v))),
      row('PARTICLES', 'Crumbs when you eat. Lower on slow phones.', segmented([{ id: 'full', label: 'FULL' }, { id: 'low', label: 'LOW' }, { id: 'off', label: 'OFF' }], s().particles, (v) => app.setSetting('particles', v))),
      row('REDUCE MOTION', 'No screen shake or blinking.', sw('reducedMotion')),
      row('SHOW FPS', 'Frame rate counter in the game.', sw('showFps')),
    )] },

      { label: 'CONTROLS', nodes: [h('div', { class: 'card' },
      h('div', { class: 'card-title' }, 'CONTROLS'),
      h('p', { class: 'hint left' }, 'Arrows or WASD, swipe on the maze, or the on-screen pad. P or Esc pauses.'),
      row('ON-SCREEN PAD', 'Auto shows it on touch screens.', segmented([{ id: 'auto', label: 'AUTO' }, { id: 'on', label: 'ON' }, { id: 'off', label: 'OFF' }], s().pad, (v) => app.setSetting('pad', v))),
      row('PAD POSITION', 'Left or right for one-handed play.', segmented([{ id: 'left', label: 'LEFT' }, { id: 'center', label: 'MID' }, { id: 'right', label: 'RIGHT' }], s().padSide, (v) => app.setSetting('padSide', v))),
      row('VIBRATION', 'Buzz when you lose a stomach (phones).', sw('vibrate')),
    )] },

      { label: 'AUDIO', nodes: [h('div', { class: 'card' },
      h('div', { class: 'card-title' }, 'AUDIO'),
      row('SOUND', null, sw('sound')),
      row('VOLUME', null, h('div', { class: 'vol-wrap' }, slider, readout)),
    )] },
    ]),
  );
  return { el, fit: true };
}
