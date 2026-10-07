/** Application shell: owns services, settings and simple screen navigation. */
import { istDateKey, weekdayOf } from '../core/clock';
import { hashString } from '../core/rng';
import { sfx } from '../audio/sfx';
import { THEMES } from '../game/config';
import { SkillModel } from '../game/difficulty';
import type { RunConfig } from '../game/run';
import { FallbackLeaderboard, LocalLeaderboard, RemoteLeaderboard } from '../services/leaderboard';
import { DEFAULT_SETTINGS, ProfileStore, type Settings } from '../services/profile';
import { recordDailyPlay } from '../services/streak';
import { clear, h } from './dom';
import { GameView } from './gameView';
import { aiLabScreen } from './screens/aiLab';
import { hallScreen } from './screens/hall';
import { howToScreen } from './screens/howTo';
import { practiceScreen } from './screens/practice';
import { previewScreen } from './screens/preview';
import { settingsScreen } from './screens/settings';
import { titleScreen } from './screens/title';
import { LayoutController, TEXT_SCALE, mountFit } from './layout';

export interface Screen {
  el: HTMLElement;
  /** Menu pages set this: the page is scaled to fit the viewport, so it never scrolls. The game view leaves it off. */
  fit?: boolean;
  dispose?: () => void;
}

export class App {
  readonly profile = new ProfileStore();
  readonly board = new FallbackLeaderboard(new RemoteLeaderboard(), new LocalLeaderboard());
  private current: Screen | null = null;
  private readonly layout: LayoutController;
  private fitOff: (() => void) | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly shell: HTMLElement,
  ) {
    this.layout = new LayoutController(shell);
    this.applySettings();
  }

  get settings(): Readonly<Settings> {
    return this.profile.get().settings;
  }

  today(): string {
    return istDateKey(Date.now());
  }

  dailyDone(): boolean {
    return !!this.profile.get().daily[this.today()];
  }

  skillModel(): SkillModel {
    return new SkillModel(this.profile.get().skill);
  }

  /** Pushes the saved settings into the page: CSS classes, scale, audio. Safe to call any time. */
  applySettings(): void {
    const s = this.settings;
    sfx.muted = !s.sound;
    sfx.volume = s.volume;
    const sh = this.shell;
    sh.classList.toggle('crt-on', s.crt && !s.highContrast);
    sh.classList.toggle('reduced', s.reducedMotion);
    sh.classList.toggle('hc', s.highContrast);
    sh.classList.toggle('font-clear', s.font === 'clear');
    sh.dataset.pad = s.pad;
    sh.dataset.padSide = s.padSide;
    this.layout.setTextSize(s.textSize);
    window.dispatchEvent(new Event('resize'));
  }

  toggleSetting(key: { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings]): void {
    this.profile.update((p) => void (p.settings[key] = !p.settings[key]));
    this.applySettings();
  }

  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.profile.update((p) => void (p.settings[key] = value));
    this.applySettings();
  }

  resetSettings(): void {
    this.profile.update((p) => void (p.settings = { ...DEFAULT_SETTINGS }));
    this.applySettings();
  }

  show(screen: Screen): void {
    this.current?.dispose?.();
    this.fitOff?.();
    this.fitOff = null;
    this.current = screen;
    clear(this.root);
    if (!screen.fit) {
      this.root.append(screen.el);
      return;
    }
    const inner = h('div', { class: 'fit-inner' }, screen.el);
    const host = h('div', { class: 'fit-host' }, inner);
    this.root.append(host);
    this.fitOff = mountFit(host, inner, () => TEXT_SCALE[this.settings.textSize]);
  }

  goTitle = (): void => this.show(titleScreen(this));
  goPractice = (): void => this.show(practiceScreen(this));
  goHall = (): void => this.show(hallScreen(this));
  goHow = (): void => this.show(howToScreen(this));
  goLab = (): void => this.show(aiLabScreen(this));
  goSettings = (): void => this.show(settingsScreen(this));

  /** One ranked attempt per IST day. Shows the menu card first (unless switched off); the attempt is only consumed on START. */
  startDaily(): void {
    if (this.dailyDone()) return;
    const weekday = weekdayOf(this.today());
    if (this.settings.menuPreview) this.show(previewScreen(this, { weekday, mode: 'daily', onStart: () => this.beginDaily() }));
    else this.beginDaily();
  }

  /** The attempt is consumed (and the streak counted) the moment the run starts. */
  private beginDaily(): void {
    const date = this.today();
    if (this.dailyDone()) return;
    const weekday = weekdayOf(date);
    const level = this.settings.difficulty;
    this.profile.update((p) => {
      p.streak = recordDailyPlay(p.streak, date);
      p.daily[date] = { date, score: 0, stages: 0, weekday, level };
    });
    const cfg: RunConfig = { mode: 'daily', seed: hashString(`messedup-${date}`), weekday, dateKey: date, adaptive: 1, level };
    this.show(new GameView(this, cfg).screen());
  }

  startPractice(weekday: number, opts: { skipPreview?: boolean } = {}): void {
    if (this.settings.menuPreview && !opts.skipPreview) this.show(previewScreen(this, { weekday, mode: 'practice', onStart: () => this.beginPractice(weekday) }));
    else this.beginPractice(weekday);
  }

  private beginPractice(weekday: number): void {
    const cfg: RunConfig = {
      mode: 'practice',
      seed: (Math.random() * 2 ** 32) >>> 0,
      weekday,
      dateKey: this.today(),
      adaptive: this.settings.adaptive ? this.skillModel().multiplier() : 1,
      level: this.settings.difficulty,
    };
    this.show(new GameView(this, cfg).screen());
  }

  theme(weekday: number) {
    return THEMES[weekday]!;
  }
}
