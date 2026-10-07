/** Application shell: owns services, settings and simple screen navigation. */
import { sfx } from '../audio/sfx';
import { THEMES } from '../game/config';
import { SkillModel } from '../game/difficulty';
import type { RunConfig } from '../game/run';
import { Account } from '../services/account';
import { DEFAULT_SETTINGS, ProfileStore, type Settings } from '../services/profile';
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
  /** Google-signed-in player and the ranked Daily Run (server side). */
  readonly account = new Account();
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

  /** Today's game day, from the server's clock once it is known. */
  today(): string {
    return this.account.today();
  }

  /** True once today's ranked attempt has been used (on any device). */
  dailyDone(): boolean {
    return !!this.account.user?.today;
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

  /**
   * The ranked Daily Run, for signed-in players: one attempt per day per account. The menu card shows first
   * (unless switched off). Pressing START asks the server for the day's secret maze, which uses the attempt.
   */
  startDaily(): void {
    if (!this.account.user || this.dailyDone()) return;
    const weekday = this.account.weekday();
    if (this.settings.menuPreview) this.show(previewScreen(this, { weekday, mode: 'daily', onStart: () => this.beginDaily() }));
    else void this.beginDaily().catch(() => this.goTitle());
  }

  private async beginDaily(): Promise<void> {
    const r = await this.account.startDaily(this.settings.difficulty);
    const cfg: RunConfig = { mode: 'daily', seed: r.seed, weekday: r.weekday, dateKey: r.date, adaptive: 1, level: r.level };
    this.show(new GameView(this, cfg, { attemptId: r.attemptId }).screen());
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
