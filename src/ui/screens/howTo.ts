import { sfx } from '../../audio/sfx';
import { ENEMY_INFO } from '../../game/content';
import type { EnemyKind } from '../../game/enemies';
import { ENEMY_SPRITE, sprite } from '../../render/art';
import type { App, Screen } from '../app';
import { button, h, spriteImg } from '../dom';

export function howToScreen(app: App): Screen {
  const enemy = (k: EnemyKind) =>
    h('div', { class: 'legend' }, spriteImg(sprite(ENEMY_SPRITE[k]), 3), h('div', {}, h('b', {}, ENEMY_INFO[k].name), h('div', { class: 'dim' }, ENEMY_INFO[k].blurb)));

  const el = h('div', { class: 'page scroll' },
    h('h2', { class: 'page-title' }, 'HOW TO PLAY'),
    h('div', { class: 'card' },
      h('div', { class: 'card-title' }, 'GOAL'),
      h('p', {}, 'Eat every dish on the level to open the EXIT, then run for the door. Clear Breakfast, Lunch and Dinner to survive the day.'),
    ),
    h('div', { class: 'card' },
      h('div', { class: 'card-title' }, 'CONTROLS'),
      h('p', {}, 'Arrows / WASD, swipe, or the on-screen pad. P or Esc pauses. You keep moving in your chosen direction.'),
    ),
    h('div', { class: 'card' },
      h('div', { class: 'card-title' }, 'WINNING AND LOSING'),
      h('p', {}, 'You start with 3 stomachs. Touching a dish costs one. The hunger bar drains and refills when you eat; at zero you lose a stomach. Idle too long and the Warden comes for you.'),
    ),
    h('div', { class: 'card' },
      h('div', { class: 'card-title' }, 'POINTS'),
      h('p', {}, 'Dish +10. Eat fast to build a combo (up to x5). Outside Maggi scares every enemy: eat them for 200, 400, 800... Bonus snack +100. Clearing a level gives time and stomach bonuses.'),
    ),
    h('div', { class: 'card' },
      h('div', { class: 'card-title' }, 'DAILY RUN AND STREAKS'),
      h('p', {}, 'One ranked Daily Run per day (resets at midnight IST). Everyone gets the same mazes. Play every day to build a streak; every 7 days earns a Streak Freeze that forgives one missed day.'),
    ),
    h('div', { class: 'card' },
      h('div', { class: 'card-title' }, 'THE ENEMIES'),
      enemy('blob'), enemy('curry'), enemy('chapati'), enemy('special'), enemy('warden'),
    ),
    button('BACK', () => { sfx.click(); app.goTitle(); }),
  );
  return { el };
}
