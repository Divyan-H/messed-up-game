import { sfx } from '../../audio/sfx';
import { disableReminders, enableReminders, pushSupported, remindersOn } from '../../services/push';
import type { App, Screen } from '../app';
import { button, h } from '../dom';
import { forgetGoogleSelection } from '../google';
import { canPromptInstall, isIos, isStandalone, onInstallChange, promptInstall } from '../install';
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

  /** A button that asks for a second tap before doing something drastic. */
  const confirmButton = (label: string, confirmLabel: string, action: () => Promise<void>, cls: string) => {
    let armed = false;
    const b = button(label, () => {
      if (!armed) {
        armed = true;
        b.textContent = confirmLabel;
        window.setTimeout(() => {
          armed = false;
          b.textContent = label;
        }, 4000);
        return;
      }
      sfx.click();
      b.disabled = true;
      action().catch(() => {
        b.disabled = false;
        b.textContent = label;
        accountMsg.textContent = 'Could not reach the server. Try again.';
      });
    }, cls);
    return b;
  };

  // ---- app: install + streak reminders
  const installArea = h('div', { class: 'set-ctl' });
  const paintInstall = () => {
    installArea.replaceChildren(
      isStandalone()
        ? h('span', { class: 'dim' }, 'INSTALLED')
        : canPromptInstall()
          ? button('INSTALL', () => { sfx.click(); void promptInstall(); }, 'tog')
          : h('span', { class: 'dim' }, isIos() ? 'Share > Add to Home Screen' : 'Browser menu > Install'),
    );
  };
  paintInstall();
  const offInstall = onInstallChange(paintInstall);

  const player = app.account.user;
  const reminderMsg = h('span', { class: 'dim' }, 'An evening notification if your streak is about to end.');
  const REMINDER_MSG = {
    denied: 'Notifications are blocked. Allow them in your browser settings.',
    unsupported: 'This browser cannot show reminders.',
    'needs-install': 'On iPhone, add the game to your Home Screen first, then turn this on there.',
  } as const;
  let reminderState = false;
  const reminderBtn = button('OFF', () => {
    sfx.click();
    reminderBtn.disabled = true;
    const done = (on: boolean) => {
      reminderState = on;
      reminderBtn.textContent = on ? 'ON' : 'OFF';
      reminderBtn.classList.toggle('on', on);
      reminderBtn.disabled = false;
    };
    if (reminderState) {
      void disableReminders().finally(() => done(false));
      return;
    }
    enableReminders().then((r) => {
      done(r === 'on');
      if (r !== 'on') reminderMsg.textContent = REMINDER_MSG[r];
    }, () => {
      done(false);
      reminderMsg.textContent = 'Could not turn reminders on. Try again.';
    });
  }, 'tog');
  if (!player) {
    reminderBtn.disabled = true;
    reminderMsg.textContent = 'Sign in on the title screen to get streak reminders.';
  } else if (!pushSupported() && isIos() && !isStandalone()) {
    reminderMsg.textContent = REMINDER_MSG['needs-install'];
  }
  void remindersOn().then((on) => {
    reminderState = on;
    reminderBtn.textContent = on ? 'ON' : 'OFF';
    reminderBtn.classList.toggle('on', on);
  });

  // ---- account
  const accountMsg = h('p', { class: 'hint left' });
  const accountCard = player
    ? h('div', { class: 'card' },
      h('div', { class: 'card-title' }, 'ACCOUNT'),
      h('p', { class: 'hint left' }, `Signed in with Google as ${player.name}.`),
      row('SIGN OUT EVERYWHERE', 'Ends your session on every phone and computer, e.g. after using a shared device.',
        confirmButton('SIGN OUT', 'TAP AGAIN', async () => {
          await app.account.signOutEverywhere();
          forgetGoogleSelection();
          accountMsg.textContent = 'Signed out on every device.';
        }, 'tog')),
      row('DELETE ACCOUNT', 'Removes your nickname, streak and every score for good. Practice stats on this device stay.',
        confirmButton('DELETE', 'REALLY DELETE?', async () => {
          await disableReminders().catch(() => undefined);
          await app.account.deleteAccount();
          forgetGoogleSelection();
          accountMsg.textContent = 'Your account and scores have been deleted.';
        }, 'tog danger')),
      accountMsg,
      h('p', { class: 'legal left' }, h('a', { href: '/privacy.html', target: '_blank', rel: 'noopener' }, 'Privacy')),
    )
    : h('div', { class: 'card' },
      h('div', { class: 'card-title' }, 'ACCOUNT'),
      h('p', { class: 'hint left' }, 'Not signed in. Sign in with Google on the title screen for the Daily Run, streaks and the leaderboard.'),
      h('p', { class: 'legal left' }, h('a', { href: '/privacy.html', target: '_blank', rel: 'noopener' }, 'Privacy')),
    );

  const el = h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('h2', { class: 'page-title' }, 'SETTINGS'), h('span', { class: 'dim' }, 'Saved instantly on this device.'), reset, button('BACK', () => { sfx.click(); app.goTitle(); }, 'ghost small')),
    paneSet([

      { label: 'GAMEPLAY', nodes: [h('div', { class: 'card' },
      h('div', { class: 'card-title' }, 'GAMEPLAY'),
      h('div', { class: 'set-label' }, h('b', {}, 'DIFFICULTY'), h('span', { class: 'dim' }, 'Applies to Daily and Practice. Your final score is multiplied, so ranks stay fair.')),
      levelPicker(app),
      row('ADAPTIVE AI', 'Practice only: the game tunes enemy speed to how you play.', sw('adaptive')),
      row('SHOW ENEMY PATHS', 'Practice only: draw each enemy\'s A* route. In the Daily Run only the Hostel Hack perk shows them.', sw('showPaths')),
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
      h('p', { class: 'hint left' }, 'Arrows or WASD, swipe on the maze, or the on-screen D-pad or joystick. P or Esc pauses.'),
      row('TOUCH CONTROL', 'D-pad: four buttons. Joystick: smaller; drag any way and it picks the closest of the four directions.', segmented([{ id: 'dpad', label: 'D-PAD' }, { id: 'joystick', label: 'STICK' }], s().touchControl, (v) => app.setSetting('touchControl', v))),
      row('SHOW CONTROLS', 'Auto shows them on touch screens.', segmented([{ id: 'auto', label: 'AUTO' }, { id: 'on', label: 'ON' }, { id: 'off', label: 'OFF' }], s().pad, (v) => app.setSetting('pad', v))),
      row('POSITION', 'Left or right for one-handed play.', segmented([{ id: 'left', label: 'LEFT' }, { id: 'center', label: 'MID' }, { id: 'right', label: 'RIGHT' }], s().padSide, (v) => app.setSetting('padSide', v))),
      row('VIBRATION', 'Buzz when you lose a stomach (phones).', sw('vibrate')),
    )] },

      { label: 'AUDIO', nodes: [h('div', { class: 'card' },
      h('div', { class: 'card-title' }, 'AUDIO'),
      row('SOUND', null, sw('sound')),
      row('VOLUME', null, h('div', { class: 'vol-wrap' }, slider, readout)),
    )] },

      { label: 'ACCOUNT', nodes: [
        h('div', { class: 'card' },
          h('div', { class: 'card-title' }, 'APP'),
          row('INSTALL ON THIS DEVICE', 'Home-screen icon, full screen, and Practice works offline.', installArea),
          row('STREAK REMINDER', null, reminderBtn),
          h('p', { class: 'hint left' }, reminderMsg),
        ),
        accountCard,
      ] },
    ]),
  );
  return { el, fit: true, dispose: offInstall };
}
