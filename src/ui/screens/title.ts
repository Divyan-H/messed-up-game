import { formatCountdown, msUntilNextIstMidnight, weekdayOf } from '../../core/clock';
import { sfx } from '../../audio/sfx';
import { MENUS, type MenuItem } from '../../game/menu';
import { FOOD_VIEW } from '../../render/foodSprites';
import { LOADING_TIPS } from '../../game/content';
import { sprite } from '../../render/art';
import { createSurface } from '../../render/canvas';
import { drawMarquee } from '../../render/renderer';
import { sanitizeName } from '../../services/profile';
import { displayStreak, streakStatus } from '../../services/streak';
import type { App, Screen } from '../app';
import { button, fmt, h, spriteImg } from '../dom';

const STREAK_MSG = {
  new: 'Play today to start a streak!',
  'played-today': 'Streak safe until tomorrow.',
  alive: 'Play today to keep the streak alive!',
  'saved-by-freeze': 'A Streak Freeze will save you if you play today.',
  broken: 'Streak lost. Start a fresh one today!',
} as const;

export function titleScreen(app: App): Screen {
  const date = app.today();
  const weekday = weekdayOf(date);
  const theme = app.theme(weekday);
  const menu = MENUS[weekday]!;
  const profile = app.profile.get();
  document.documentElement.style.setProperty('--accent', theme.accent);

  // decorative marquee
  const marquee = createSurface(272, 44);
  marquee.className = 'marquee';
  const mctx = marquee.getContext('2d')!;
  mctx.imageSmoothingEnabled = false;
  let raf = 0;
  const loop = (t: number) => {
    drawMarquee(mctx, 272, 44, t / 1000, theme);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  const done = app.dailyDone();
  const todayRec = profile.daily[date];
  const status = streakStatus(profile.streak, date);

  const countdown = h('span', { class: 'mono' }, formatCountdown(msUntilNextIstMidnight(Date.now())));
  const timer = window.setInterval(() => {
    const ms = msUntilNextIstMidnight(Date.now());
    countdown.textContent = formatCountdown(ms);
    if (ms < 1000) app.goTitle();
  }, 1000);

  const dailyBtn = button(done ? `DAILY DONE - ${fmt(todayRec?.score ?? 0)}` : 'DAILY RUN', () => {
    sfx.unlock();
    sfx.start();
    app.startDaily();
  }, 'primary big');
  dailyBtn.disabled = done;

  const nameInput = h('input', {
    class: 'name-input',
    value: profile.nickname,
    maxLength: 12,
    spellcheck: false,
    autocomplete: 'off',
    'aria-label': 'Your nickname',
    onchange: (e: Event) => {
      const v = sanitizeName((e.target as HTMLInputElement).value);
      if (v.length >= 2) app.profile.update((p) => void (p.nickname = v));
      (e.target as HTMLInputElement).value = app.profile.get().nickname;
    },
  });

  const mealRow = (label: string, items: MenuItem[]) =>
    h('div', { class: 'meal' },
      h('b', {}, label),
      h('span', { class: 'icons' },
        ...items.map((i) => {
          const img = spriteImg(sprite(FOOD_VIEW[i.kind].sprite), 2);
          img.title = i.name;
          return img;
        }),
        h('span', { class: 'names' }, items.map((i) => i.name).join(' / '))));

  const el = h('div', { class: 'title scroll' },
    h('div', { class: 'daybadge' }, `${theme.name.toUpperCase()} - ${theme.title.toUpperCase()}`),
    h('h1', { class: 'logo' }, h('span', {}, 'MESSED'), h('span', {}, 'UP')),
    h('p', { class: 'tagline' }, 'Survive the week. Skip the sambar.'),
    marquee,

    h('div', { class: 'card streak' },
      spriteImg(sprite('flame'), 4),
      h('div', { class: 'streak-main' },
        h('div', { class: 'big-num' }, String(displayStreak(profile.streak, date))),
        h('div', { class: 'dim' }, 'DAY STREAK'),
      ),
      h('div', { class: 'streak-side' },
        h('div', {}, `BEST ${profile.streak.best}`),
        h('div', {}, `FREEZE x${profile.streak.freezes}`),
      ),
    ),
    h('p', { class: 'hint' }, STREAK_MSG[status]),

    dailyBtn,
    h('p', { class: 'hint' }, done ? h('span', {}, 'Next menu in ', countdown) : h('span', {}, 'Same maze for everyone. One try a day. Menu resets in ', countdown)),
    button('PRACTICE', () => { sfx.click(); app.goPractice(); }),
    h('div', { class: 'row2' },
      button('HALL OF FAME', () => { sfx.click(); app.goHall(); }),
      button('HOW TO PLAY', () => { sfx.click(); app.goHow(); }),
    ),
    h('div', { class: 'row2' },
      button('AI LAB', () => { sfx.click(); app.goLab(); }, 'ghost'),
      button('SETTINGS', () => { sfx.click(); app.goSettings(); }, 'ghost'),
    ),

    h('div', { class: 'card menu' },
      h('div', { class: 'card-title' }, `TODAY'S MENU (${theme.name.slice(0, 3).toUpperCase()})`),
      mealRow('BREAKFAST', menu.breakfast),
      mealRow('LUNCH', menu.lunch),
      mealRow('DINNER', menu.dinner),
      mealRow('SNACK', [menu.snack]),
    ),
    h('label', { class: 'namebox' }, h('span', {}, 'YOUR NAME'), nameInput),
    h('p', { class: 'tip' }, LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)]),
  );

  return {
    el,
    dispose: () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
    },
  };
}
