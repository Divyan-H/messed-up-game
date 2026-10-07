import { sfx } from '../../audio/sfx';
import { THEMES, WEEKDAY_NAMES, tierOf } from '../../game/config';
import { stageDifficulty } from '../../game/difficulty';
import { ENEMY_INFO } from '../../game/content';
import { ENEMY_SPRITE, sprite } from '../../render/art';
import type { App, Screen } from '../app';
import { button, h, spriteImg } from '../dom';

export function practiceScreen(app: App): Screen {
  const skill = app.skillModel();
  const order = [1, 2, 3, 4, 5, 6, 0];
  const rows = order.map((wd) => {
    const theme = THEMES[wd]!;
    const diff = stageDifficulty(wd, 0, 1, app.settings.difficulty);
    const b = h('button', {
      class: 'btn day-btn',
      type: 'button',
      style: `--day:${theme.wallTop}`,
      onclick: () => {
        sfx.unlock();
        sfx.start();
        app.startPractice(wd);
      },
    },
      h('span', { class: 'day-chip' }, WEEKDAY_NAMES[wd]!.slice(0, 3).toUpperCase()),
      h('span', { class: 'day-name' }, theme.title),
      h('span', { class: 'day-enemies' }, ...diff.roster.map((k) => spriteImg(sprite(ENEMY_SPRITE[k]), 1))),
      h('span', { class: 'day-tier' }, 'x'.repeat(tierOf(wd) + 1).replace(/x/g, '*')),
    );
    return b;
  });

  const el = h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('h2', { class: 'page-title' }, 'PRACTICE'), button('BACK', () => { sfx.click(); app.goTitle(); }, 'ghost small')),
    h('p', { class: 'hint' }, 'Pick a day. Random maze, no streak, no ranking. Difficulty and adaptive AI are in Settings.'),
    h('div', { class: 'card mood-card' },
      h('div', { class: 'card-title' }, "CHEF'S MOOD"),
      h('div', { class: 'mood' }, skill.label()),
      h('p', { class: 'hint' }, `The game watches how you play and tunes enemy speed (x${skill.multiplier().toFixed(2)} right now).`),
    ),
    h('div', { class: 'daylist' }, ...rows),
    h('p', { class: 'hint' }, `Today's boss: ${ENEMY_INFO.special.name}. ${ENEMY_INFO.special.blurb}`),
  );
  return { el, fit: true };
}
