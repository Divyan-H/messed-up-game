import { formatCountdown, istDateKey, msUntilNextIstMidnight } from '../../core/clock';
import { sfx } from '../../audio/sfx';
import { MENUS, type MenuItem } from '../../game/menu';
import { FOOD_VIEW } from '../../render/foodSprites';
import { LOADING_TIPS } from '../../game/content';
import { sprite } from '../../render/art';
import { createSurface } from '../../render/canvas';
import { drawMarquee } from '../../render/renderer';
import { ApiError } from '../../services/api';
import { nicknameProblem, NICK_MAX } from '../../services/nickname';
import type { StreakStatus } from '../../services/streak';
import type { App, Screen } from '../app';
import { button, fmt, h, spriteImg } from '../dom';
import { forgetGoogleSelection, renderGoogleButton } from '../google';

const STREAK_MSG: Record<StreakStatus, string> = {
  new: 'Play today to start a streak!',
  'played-today': 'Streak safe until tomorrow.',
  alive: 'Play today to keep the streak alive!',
  'saved-by-freeze': 'A Streak Freeze will save you if you play today.',
  broken: 'Streak lost. Start a fresh one today!',
};

const RENAME_ERRORS: Record<string, string> = {
  name_taken: 'That name is taken. Try another.',
  name_not_allowed: 'Please pick a different name.',
  rate_limited: 'Too many changes. Try again later.',
};

export function titleScreen(app: App): Screen {
  const account = app.account;
  const player = account.user;
  const weekday = account.weekday();
  const theme = app.theme(weekday);
  const menu = MENUS[weekday]!;
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

  const countdown = h('span', { class: 'mono' }, formatCountdown(msUntilNextIstMidnight(account.now())));
  let reloading = false;
  const timer = window.setInterval(() => {
    countdown.textContent = formatCountdown(msUntilNextIstMidnight(account.now()));
    // a new game day started: fetch today's status from the server (this re-draws the screen)
    if (account.state === 'ready' && !reloading && istDateKey(account.now()) !== account.today()) {
      reloading = true;
      void account.load().finally(() => void (reloading = false));
    }
  }, 1000);

  // ---- ranked play depends on the account state
  const today = player?.today ?? null;
  let dailyLabel = 'DAILY RUN';
  let dailyHint: Node | string;
  if (account.state === 'loading') {
    dailyLabel = 'CONNECTING...';
    dailyHint = 'Checking your account...';
  } else if (account.state === 'offline') {
    dailyHint = account.offline === 'not_configured'
      ? 'Ranked play is offline right now. Practice still works.'
      : 'Cannot reach the server. Practice still works offline.';
  } else if (!player) {
    dailyHint = 'Sign in with Google to play the ranked Daily Run, keep a streak and join the leaderboard.';
  } else if (today?.status === 'done') {
    dailyLabel = `DAILY DONE - ${fmt(today.score)}`;
    dailyHint = h('span', {}, today.rank ? `Rank #${today.rank} today. ` : '', 'Next menu in ', countdown);
  } else if (today) {
    dailyLabel = account.hasPending() ? 'SUBMITTING YOUR RUN...' : 'DAILY USED';
    dailyHint = h('span', {}, 'Next menu in ', countdown);
  } else {
    dailyHint = h('span', {}, 'Same maze for everyone. One try a day. Menu resets in ', countdown);
  }
  const dailyBtn = button(dailyLabel, () => {
    sfx.unlock();
    sfx.start();
    app.startDaily();
  }, 'primary big');
  dailyBtn.disabled = !player || !!today;

  const gsi = h('div', { class: 'gsi' });
  const authError = h('p', { class: 'hint bad' });
  const showSignIn = account.state === 'ready' && !player;
  if (showSignIn) {
    requestAnimationFrame(() => {
      void renderGoogleButton(gsi, (credential) => {
        authError.textContent = 'Signing in...';
        account.signIn(credential).catch((e: unknown) => {
          authError.textContent = e instanceof ApiError && e.code === 'rate_limited'
            ? 'Too many attempts. Try again in a few minutes.'
            : 'Sign-in failed. Please try again.';
        });
      }).then((ok) => {
        if (!ok) authError.textContent = 'Google sign-in could not load. Check your connection or ad blocker.';
      });
    });
  }

  // ---- streak card: the server's streak; guests see an invitation instead
  const streakCard = player
    ? h('div', { class: 'card streak' },
      spriteImg(sprite('flame'), 4),
      h('div', { class: 'streak-main' },
        h('div', { class: 'big-num' }, String(player.streak.current)),
        h('div', { class: 'dim' }, 'DAY STREAK'),
      ),
      h('div', { class: 'streak-side' },
        h('div', {}, `BEST ${player.streak.best}`),
        h('div', {}, `FREEZE x${player.streak.freezes}`),
      ),
    )
    : h('div', { class: 'card streak' },
      spriteImg(sprite('flame'), 4),
      h('div', { class: 'streak-main' }, h('div', { class: 'dim' }, 'Streaks and ranks need a Google sign-in. Practice is open to everyone.')),
    );

  // ---- nickname (signed-in players only; unique across the game)
  let nameRow: Node | null = null;
  if (player) {
    const nameMsg = h('p', { class: 'hint' });
    const nameInput = h('input', {
      class: 'name-input',
      value: player.name,
      maxLength: NICK_MAX,
      spellcheck: false,
      autocomplete: 'off',
      'aria-label': 'Your nickname',
      onchange: (e: Event) => {
        const input = e.target as HTMLInputElement;
        const v = input.value.trim();
        const problem = nicknameProblem(v);
        if (problem) {
          nameMsg.textContent = problem;
          nameMsg.className = 'hint bad';
          input.value = player.name;
          return;
        }
        nameMsg.textContent = 'Saving...';
        nameMsg.className = 'hint';
        account.rename(v).catch((err: unknown) => {
          nameMsg.textContent = (err instanceof ApiError && RENAME_ERRORS[err.code]) || 'Could not save the name. Try again.';
          nameMsg.className = 'hint bad';
          input.value = player.name;
        });
      },
    });
    nameRow = h('div', {},
      h('label', { class: 'namebox' }, h('span', {}, 'YOUR NAME'), nameInput),
      nameMsg,
      h('p', { class: 'acct' },
        h('span', { class: 'dim' }, 'Signed in with Google.'),
        h('button', {
          class: 'btn small linkish',
          type: 'button',
          onclick: () => {
            sfx.click();
            forgetGoogleSelection();
            void account.signOut();
          },
        }, 'SIGN OUT'),
      ),
    );
  }

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

  const hero = h('div', { class: 't-hero' },
    h('div', { class: 'daybadge' }, `${theme.name.toUpperCase()} - ${theme.title.toUpperCase()}`),
    h('h1', { class: 'logo' }, h('span', {}, 'MESSED'), h('span', {}, 'UP')),
    h('p', { class: 'tagline' }, 'Survive the week. Skip the sambar.'),
    marquee,
    streakCard,
    player ? h('p', { class: 'hint' }, STREAK_MSG[player.streak.status]) : null,
  );

  const actions = h('div', { class: 't-actions' },
    dailyBtn,
    h('p', { class: 'hint' }, dailyHint),
    showSignIn ? h('div', { class: 'gsi-wrap' }, gsi, authError) : null,
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
    nameRow,
    h('p', { class: 'tip' }, LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)]),
    h('p', { class: 'legal' }, h('a', { href: '/privacy.html', target: '_blank', rel: 'noopener' }, 'Privacy')),
  );
  const el = h('div', { class: 'title' }, hero, actions);

  // re-draw when the account changes (signed in or out, renamed, run verified, new day)
  const off = account.subscribe(() => app.goTitle());

  return {
    el,
    fit: true,
    dispose: () => {
      off();
      cancelAnimationFrame(raf);
      clearInterval(timer);
    },
  };
}
