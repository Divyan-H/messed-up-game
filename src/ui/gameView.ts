/**
 * Play screen: owns the rAF loop (fixed 60 Hz simulation, free-running rendering), the HUD,
 * overlays (intro / perks / clear / pause / game over) and the glue from sim events to
 * audio, particles and funny text. The game rules themselves live in src/game and know nothing of this file.
 */
import { formatCountdown, msUntilNextIstMidnight } from '../core/clock';
import { sfx } from '../audio/sfx';
import { COURSES, DT, MAX_STOMACHS, THEMES, TILE, WEEKDAY_NAMES } from '../game/config';
import { ACHIEVEMENTS, COMBO_CALLS, DEATH_LINES, LOADING_TIPS, QUIPS_BY_FOOD, WARDEN_BARKS, WARDEN_WARNINGS } from '../game/content';
import { Bot } from '../game/bot';
import { LEVELS, SkillModel, type Level } from '../game/difficulty';
import { MENUS, mealItems, uniqueItems } from '../game/menu';
import { xOf, yOf } from '../game/maze';
import { moverX, moverY } from '../game/mover';
import { Run, type RunConfig, type RunEvent, type RunPhase } from '../game/run';
import { ENEMY_SPRITE, sprite } from '../render/art';
import { createSurface } from '../render/canvas';
import { Effects } from '../render/effects';
import { FOOD_VIEW } from '../render/foodSprites';
import { HEADER_H, Renderer, VIEW_H, VIEW_W } from '../render/renderer';
import { ApiError } from '../services/api';
import type { DailyFinish } from '../services/account';
import type { App, Screen } from './app';
import { button, clear, fmt, h, spriteImg } from './dom';
import { InputController } from './input';
import { fitScale } from './layout';
import { runTour, type TourHandle } from './tour';

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;

/**
 * `?autopilot` lets the bot play and `?sim=4` runs the simulation faster. Both only work in Practice:
 * the ranked Daily Run always takes human input at real-time speed.
 */
const QUERY = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
const AUTOPILOT_QUERY = QUERY.has('autopilot');
const SIM_QUERY = Math.min(8, Math.max(1, Number(QUERY.get('sim') ?? 1) || 1));
/** Longest frame gap the simulation catches up on. Anything longer is dropped, so a slowed-down device cannot play in slow motion. */
const MAX_FRAME_SECONDS = 0.25;

export class GameView {
  private readonly run: Run;
  private readonly fx = new Effects();
  private readonly canvas = createSurface(VIEW_W, VIEW_H);
  private readonly renderer: Renderer;
  private readonly input: InputController;
  private readonly disposers: Array<() => void> = [];

  private raf = 0;
  private last = 0;
  private acc = 0;
  private paused = false;
  private tourOpen = false;
  /** The course intro card stays up (and the clock stands still) until the player closes it. */
  private introOpen = false;
  private tour: TourHandle | null = null;
  private hudEl: HTMLElement | null = null;
  private finalized = false;
  private stageRef: Run['stage'] | null = null;
  private lastBonus = 0;
  private toastTimer = 0;
  private unlocked: string[] = [];
  private bot = new Bot();
  private readonly level: Level;
  private readonly autopilot: boolean;
  /** Server verification of a finished Daily Run (null in Practice). */
  private submission: Promise<DailyFinish> | null = null;
  private readonly simSpeed: number;

  // DOM
  private readonly hearts = h('div', { class: 'hearts' });
  private readonly scoreEl = h('div', { class: 'score' }, '0');
  private readonly dayEl = h('div', { class: 'daylabel' });
  private readonly hungerBar = h('i');
  private readonly maggiBar = h('i');
  private readonly maggiWrap = h('div', { class: 'bar maggi hidden' }, this.maggiBar);
  private readonly comboEl = h('div', { class: 'combo' });
  private readonly leftEl = h('div', { class: 'left' });
  private readonly toastEl = h('div', { class: 'toast' });
  private readonly ticker = h('div', { class: 'ticker' }, pick(LOADING_TIPS));
  private readonly overlay = h('div', { class: 'overlay hidden' });
  private readonly wrap = h('div', { class: 'stage-wrap' });
  private readonly fpsEl = h('div', { class: 'fps hidden' });
  private fpsFrames = 0;
  private fpsStamp = 0;

  // HUD cache (only touch the DOM when a value changes)
  private hud = { score: -1, stomachs: -1, left: -1, combo: '', day: '' };

  constructor(
    private readonly app: App,
    private readonly cfg: RunConfig,
    /** Present for the ranked Daily Run: the attempt the server opened for this run. */
    private readonly daily: { attemptId: string } | null = null,
  ) {
    this.level = cfg.level ?? 'normal';
    this.autopilot = AUTOPILOT_QUERY && cfg.mode === 'practice';
    this.simSpeed = cfg.mode === 'practice' ? SIM_QUERY : 1;
    this.run = new Run(cfg);
    const ctx = this.canvas.getContext('2d')!;
    this.renderer = new Renderer(ctx);
    this.canvas.className = 'cv';
    this.fx.reducedMotion = app.settings.reducedMotion;
    this.fx.particles = app.settings.particles;
    this.input = new InputController(this.wrap, {
      onPause: () => this.togglePause(),
      onNumber: (n) => this.pickPerk(n - 1),
    });
  }

  screen(): Screen {
    const pad = (cls: string, code: 1 | 2 | 3 | 4) => {
      const b = h('button', { class: `pad ${cls}`, type: 'button', 'aria-label': cls });
      this.input.bindButton(b, code);
      return b;
    };
    const dpad = h('div', { class: 'dpad' }, pad('up', 1), pad('left', 4), pad('right', 2), pad('down', 3));

    this.wrap.append(this.canvas, this.toastEl, this.fpsEl, this.overlay);
    this.fpsEl.classList.toggle('hidden', !this.app.settings.showFps);
    this.ticker.classList.toggle('hidden', !this.app.settings.tips);
    const el = h('div', { class: 'game' },
      h('div', { class: 'hud' },
        h('div', { class: 'hud-row' }, this.hearts, this.scoreEl, h('div', { class: 'hud-btns' }, button('?', () => this.maybeTour(true), 'tiny help'), button('II', () => this.togglePause(), 'tiny pause'))),
        h('div', { class: 'hud-row' }, this.dayEl, this.leftEl),
        h('div', { class: 'hud-row' }, h('div', { class: 'bar hunger' }, this.hungerBar), this.comboEl),
        this.maggiWrap,
      ),
      this.wrap, this.ticker, dpad,
    );

    this.hudEl = el;
    const ro = new ResizeObserver(() => {
      this.fit();
      this.fitOverlay();
    });
    ro.observe(this.wrap);
    this.disposers.push(() => ro.disconnect());

    const vis = () => {
      if (document.hidden && this.run.phase === 'playing' && !this.paused) this.togglePause(true);
    };
    document.addEventListener('visibilitychange', vis);
    // Closing or reloading mid-Daily: warn first, and if the player leaves anyway send what was played.
    const hide = () => {
      if (this.daily && !this.finalized && this.run.tickCount > 0) this.finalize(true);
    };
    const warn = (e: BeforeUnloadEvent) => {
      if (!this.daily || this.finalized) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('pagehide', hide);
    window.addEventListener('beforeunload', warn);
    const introKey = (e: KeyboardEvent) => {
      if (!this.introOpen || this.tourOpen || !['Enter', 'Space', 'Escape'].includes(e.code)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.dismissIntro();
    };
    window.addEventListener('keydown', introKey, true);
    this.disposers.push(() => {
      window.removeEventListener('keydown', introKey, true);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('beforeunload', warn);
    });

    this.syncStage();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    return { el, dispose: () => this.dispose() };
  }

  private dispose(): void {
    cancelAnimationFrame(this.raf);
    this.tour?.close();
    this.input.dispose();
    this.disposers.forEach((d) => d());
  }

  private fit(): void {
    const w = this.wrap.clientWidth;
    const hh = this.wrap.clientHeight;
    if (!w || !hh) return;
    let scale = Math.min(w / VIEW_W, hh / VIEW_H);
    scale = fitScale(scale, this.app.settings.scaleMode);
    this.canvas.style.width = `${Math.floor(VIEW_W * scale)}px`;
    this.canvas.style.height = `${Math.floor(VIEW_H * scale)}px`;
  }

  // ---------------------------------------------------------------- loop

  private readonly frame = (ms: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(MAX_FRAME_SECONDS, (ms - this.last) / 1000);
    this.last = ms;
    if (!this.paused && !this.tourOpen && !this.introOpen) {
      this.acc += dt * this.simSpeed;
      let steps = 0;
      const maxSteps = Math.ceil(MAX_FRAME_SECONDS / DT) * this.simSpeed;
      while (this.acc >= DT && steps++ < maxSteps) {
        if (this.autopilot && this.run.phase === 'perk') this.pickPerk(0);
        this.run.tick(this.autopilot && this.run.phase === 'playing' ? this.bot.decide(this.run.stage) : this.input.code);
        this.acc -= DT;
      }
      if (steps >= maxSteps) this.acc = 0;
      this.fx.update(dt);
    }
    this.consume();
    this.syncStage();
    this.renderer.draw(this.run.stage, this.fx, { anim: ms / 1000, showPaths: this.pathsVisible() });
    this.updateHud();
    if (this.app.settings.showFps) this.updateFps(ms);
  };

  /** Enemy route overlay: a free setting in Practice; in the ranked Daily Run only the Hostel Hack perk shows it. */
  private pathsVisible(): boolean {
    return this.run.mods.showPaths || (this.cfg.mode === 'practice' && this.app.settings.showPaths);
  }

  private updateFps(ms: number): void {
    this.fpsFrames++;
    if (ms - this.fpsStamp < 500) return;
    this.fpsEl.textContent = `${Math.round((this.fpsFrames * 1000) / (ms - this.fpsStamp))} FPS`;
    this.fpsFrames = 0;
    this.fpsStamp = ms;
  }

  private syncStage(): void {
    if (this.stageRef === this.run.stage) return;
    this.stageRef = this.run.stage;
    this.bot = new Bot();
    this.renderer.prepare(this.run.stage, THEMES[this.cfg.weekday]!);
  }

  // ---------------------------------------------------------------- events

  private consume(): void {
    for (const ev of this.run.drainEvents()) this.onEvent(ev);
  }

  private onEvent(ev: RunEvent): void {
    const fx = this.fx;
    const T = 16;
    switch (ev.t) {
      case 'stageStart':
        this.input.reset();
        fx.clear();
        this.syncStage();
        this.showIntro(ev.course);
        break;
      case 'phase':
        this.onPhase(ev.phase);
        break;
      case 'eat': {
        sfx.eat(ev.combo);
        fx.burst(ev.x * T + 8, ev.y * T + 8, FOOD_VIEW[ev.item.kind].color, 7);
        fx.popup(`+${ev.pts}`, ev.x * T + 8, ev.y * T, ev.mult > 1 ? '#70e000' : '#ffd23f');
        if (ev.combo > 1 && ev.combo % 5 === 0) this.toast(COMBO_CALLS[Math.min(ev.mult, 5)] || 'COMBO!');
        if (Math.random() < 0.2) this.say(pick(QUIPS_BY_FOOD[ev.item.kind]));
        break;
      }
      case 'snackIn':
        this.toast('BONUS SNACK APPEARED!');
        break;
      case 'snack':
        sfx.snack();
        fx.burst(ev.x * T + 8, ev.y * T + 8, '#f4a261', 12);
        fx.popup(`+${ev.pts}`, ev.x * T + 8, ev.y * T, '#ffd23f');
        this.say(pick(QUIPS_BY_FOOD[this.run.stage.snackItem.kind]));
        break;
      case 'maggi':
        sfx.maggi();
        this.toast('OUTSIDE MAGGI! Eat them!');
        this.say('Maggi from outside: the ultimate cheat code.');
        break;
      case 'eatEnemy':
        sfx.eatEnemy();
        fx.shake(3);
        fx.popup(`+${ev.pts}`, ev.x * T, ev.y * T, '#4cc9f0');
        break;
      case 'hit':
        sfx.hit();
        fx.shake(8);
        if (this.app.settings.vibrate) navigator.vibrate?.(70);
        fx.burst(this.run.stage.player.col * T + 8, this.run.stage.player.row * T + 8, '#e63946', 16, 70);
        this.toast(ev.cause === 'starve' ? 'STARVED! No food, no life.' : 'OUCH! Lost a stomach.');
        break;
      case 'exitOpen':
        sfx.exitOpen();
        this.toast('EXIT OPEN! RUN!');
        this.say('All dishes cleared. Find the door.');
        break;
      case 'wardenWarn':
        this.say(pick(WARDEN_WARNINGS));
        break;
      case 'wardenIn':
        sfx.warden();
        this.toast(pick(WARDEN_BARKS));
        break;
      case 'clear':
        this.lastBonus = ev.bonus;
        sfx.clear();
        break;
      case 'lost':
        sfx.over();
        fx.shake(10);
        break;
      default:
        break;
    }
  }

  private onPhase(phase: RunPhase): void {
    if (phase === 'playing') {
      this.hideOverlay();
      this.maybeTour();
    }
    else if (phase === 'clear') this.showClear();
    else if (phase === 'perk') this.showPerks();
    else if (phase === 'over' || phase === 'complete') {
      this.finalize();
      this.showEnd();
    }
  }

  // ---------------------------------------------------------------- first-time tour

  /** Screen rectangle of a maze tile (the canvas is scaled to fit, so map from maze pixels to page pixels). */
  private tileRect(col: number, row: number): DOMRect | null {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return null;
    const k = r.width / VIEW_W;
    return new DOMRect(r.left + col * TILE * k, r.top + (HEADER_H + row * TILE) * k, TILE * k, TILE * k);
  }

  /** Explains the interface the first time anyone plays. The simulation is frozen while it is open. */
  private maybeTour(force = false): void {
    if (this.tour || this.run.phase !== 'playing' || (!force && this.app.profile.get().tourSeen)) return;
    if (this.paused) this.togglePause(false);
    const st = this.run.stage;
    const hud = (sel: string) => () => this.hudEl?.querySelector(sel)?.getBoundingClientRect() ?? null;
    const p = st.player;
    const enemy = st.enemies.find((e) => e.mode !== 'eaten');
    const food = st.foodAt.values().next().value;
    const maggi = st.maggiAlive.values().next().value as number | undefined;
    const steps = [
      { target: () => this.tileRect(moverX(p), moverY(p)), title: 'THIS IS YOU', text: 'The hungry student with the white glow. Steer with Arrow keys / WASD, swipe on the maze, or the on-screen pad. You keep moving until you turn.' },
      { target: () => (enemy ? this.tileRect(moverX(enemy.m), moverY(enemy.m)) : null), title: 'THE CHASERS', text: 'Angry dishes with a red glow hunt you. Touching one costs a stomach. They turn blue when scared, and then YOU can eat them.' },
      { target: () => (food ? this.tileRect(xOf(food.tile), yOf(food.tile)) : null), title: 'DISHES', text: 'Eat every dish for +10 each. Eat quickly to chain a combo, up to x5.' },
      { target: () => (maggi !== undefined ? this.tileRect(xOf(maggi), yOf(maggi)) : null), title: 'OUTSIDE MAGGI', text: 'A power-up. Eat it and every chaser gets scared for a few seconds. Chase them down for big points.' },
      { target: () => this.tileRect(xOf(st.layout.exit), yOf(st.layout.exit)), title: 'THE EXIT', text: 'It opens once every dish is eaten. Run for the door to clear the course.' },
      { target: hud('.hearts'), title: 'STOMACHS', text: 'Your lives. Touching a chaser or starving costs one. Lose them all and the day is over.' },
      { target: hud('.score'), title: 'SCORE', text: 'Your points. The combo meter next to the hunger bar shows your chain.' },
      { target: hud('.hunger'), title: 'HUNGER BAR', text: 'It drains over time and refills when you eat. If it hits zero you lose a stomach, so keep eating.' },
      { target: hud('.pause'), title: 'PAUSE', text: 'Tap here, or press P or Esc, to pause. The ? button beside it replays this tour any time.' },
    ];
    this.tourOpen = true;
    this.input.reset();
    this.tour = runTour(steps, {
      onEnd: () => {
        this.tour = null;
        this.tourOpen = false;
        this.last = performance.now();
        this.input.reset();
        this.app.profile.update((pr) => void (pr.tourSeen = true));
      },
    });
    if (!this.tourOpen) this.tour = null;
  }

  // ---------------------------------------------------------------- HUD

  private updateHud(): void {
    const run = this.run;
    const st = run.stage;
    const score = run.totalScore;
    if (score !== this.hud.score) {
      this.hud.score = score;
      this.scoreEl.textContent = fmt(score);
    }
    const stomachs = Math.max(0, st.stomachs);
    if (stomachs !== this.hud.stomachs) {
      this.hud.stomachs = stomachs;
      clear(this.hearts);
      for (let i = 0; i < Math.min(stomachs, MAX_STOMACHS); i++) this.hearts.append(spriteImg(sprite('heart'), 2, 'px heart'));
    }
    const lvl = this.level === 'normal' ? '' : ` ${LEVELS[this.level].label}`;
    const day = `${WEEKDAY_NAMES[this.cfg.weekday]!.slice(0, 3).toUpperCase()} ${COURSES[run.stageIndex]!.toUpperCase()}${lvl}`;
    if (day !== this.hud.day) {
      this.hud.day = day;
      this.dayEl.textContent = day;
    }
    const left = st.exitOpen ? 0 : st.foodLeft;
    if (left !== this.hud.left) {
      this.hud.left = left;
      this.leftEl.textContent = st.exitOpen ? 'GO TO EXIT!' : `DISHES LEFT ${left}`;
      this.leftEl.classList.toggle('go', st.exitOpen);
    }
    this.hungerBar.style.width = `${Math.max(0, st.hunger) * 100}%`;
    this.hungerBar.parentElement!.classList.toggle('low', st.hunger < 0.25);
    const combo = st.combo > 1 ? `COMBO x${st.comboMult} (${st.combo})` : '';
    if (combo !== this.hud.combo) {
      this.hud.combo = combo;
      this.comboEl.textContent = combo;
    }
    const on = st.maggiUntil > 0;
    this.maggiWrap.classList.toggle('hidden', !on);
    if (on) {
      const total = st.params.difficulty.maggiSeconds + st.params.mods.maggiBonus;
      this.maggiBar.style.width = `${Math.max(0, ((st.maggiUntil - st.time) / total) * 100)}%`;
    }
  }

  private toast(text: string, ms = 1300): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  private say(text: string): void {
    this.ticker.textContent = text;
  }

  // ---------------------------------------------------------------- overlays

  private showOverlay(...kids: Array<Node | null>): void {
    clear(this.overlay);
    for (const k of kids) if (k) this.overlay.append(k);
    this.overlay.classList.remove('hidden');
    this.fitOverlay();
  }

  /** Overlay panels never scroll: if one is taller than the play area it is scaled down to fit. */
  private fitOverlay(): void {
    const panel = this.overlay.firstElementChild as HTMLElement | null;
    if (!panel || this.overlay.classList.contains('hidden')) return;
    panel.style.transform = '';
    const avail = this.overlay.clientHeight - 16;
    const need = panel.offsetHeight;
    if (avail > 0 && need > avail) panel.style.transform = `scale(${(avail / need).toFixed(3)})`;
  }

  private hideOverlay(): void {
    this.overlay.classList.add('hidden');
  }

  private showIntro(course: number): void {
    const theme = THEMES[this.cfg.weekday]!;
    const items = uniqueItems(mealItems(MENUS[this.cfg.weekday]!, course));
    const roster = this.run.stage.params.difficulty.roster;
    this.introOpen = !this.autopilot;
    this.input.reset();
    this.showOverlay(h('div', { class: 'panel intro' },
      h('button', { class: 'x-close', type: 'button', 'aria-label': 'Close', onclick: () => this.dismissIntro() }, 'X'),
      h('div', { class: 'dim' }, `COURSE ${course + 1} OF 3`),
      h('h2', { class: 'big' }, `${theme.name.toUpperCase()}`),
      h('h3', { class: 'accent' }, COURSES[course]!.toUpperCase()),
      h('p', { class: 'hint' }, `"${theme.title}"`),
      h('div', { class: 'foods small' }, ...items.map((i) =>
        h('div', { class: 'food-tile static' }, spriteImg(sprite(FOOD_VIEW[i.kind].sprite), 3), h('span', { class: 'fname' }, i.name)))),
      h('div', { class: 'roster' }, ...roster.map((k) => spriteImg(sprite(ENEMY_SPRITE[k]), 3))),
      this.app.settings.tips ? h('p', { class: 'tip' }, pick(LOADING_TIPS)) : null,
      button('START', () => this.dismissIntro(), 'primary'),
      h('p', { class: 'dim' }, 'Press Enter or tap X'),
    ));
  }

  private dismissIntro(): void {
    if (!this.introOpen) return;
    this.introOpen = false;
    sfx.click();
    this.last = performance.now();
    this.input.reset();
    this.hideOverlay();
  }

  private showClear(): void {
    const st = this.run.stage;
    this.showOverlay(h('div', { class: 'panel' },
      h('h2', { class: 'big good' }, 'COURSE CLEARED!'),
      h('p', {}, `Time ${st.stats.time.toFixed(1)}s`),
      h('p', {}, `Bonus +${fmt(this.lastBonus)}`),
      h('p', { class: 'hint' }, `Stomachs left: ${st.stomachs}`),
    ));
  }

  private showPerks(): void {
    const cards = this.run.perkOffer.map((p, i) =>
      h('button', { class: 'btn perk', type: 'button', onclick: () => this.pickPerk(i) },
        h('b', {}, `${i + 1}. ${p.name}`), h('span', {}, p.desc)));
    this.showOverlay(h('div', { class: 'panel' },
      h('h2', { class: 'big' }, 'PICK A PERK'),
      h('p', { class: 'hint' }, 'Mess committee approved. Choose one.'),
      ...cards,
    ));
  }

  private pickPerk(i: number): void {
    const perk = this.run.perkOffer[i];
    if (this.run.phase !== 'perk' || !perk) return;
    sfx.click();
    this.run.choosePerk(perk.id);
  }

  private togglePause(force?: boolean): void {
    if (this.run.phase !== 'playing') return;
    this.paused = force ?? !this.paused;
    if (!this.paused) {
      this.last = performance.now();
      this.hideOverlay();
      return;
    }
    const s = this.app.settings;
    this.showOverlay(h('div', { class: 'panel' },
      h('h2', { class: 'big' }, 'PLATE BREAK'),
      h('p', { class: 'hint' }, 'The warden is also on a tea break.'),
      button('RESUME', () => this.togglePause(false), 'primary'),
      button('HOW TO PLAY (TOUR)', () => this.maybeTour(true)),
      button(s.sound ? 'SOUND: ON' : 'SOUND: OFF', () => { this.app.toggleSetting('sound'); this.togglePause(true); }),
      button(s.crt ? 'SCANLINES: ON' : 'SCANLINES: OFF', () => { this.app.toggleSetting('crt'); this.togglePause(true); }),
      this.cfg.mode === 'practice'
        ? button(s.showPaths ? 'ENEMY PATHS: ON' : 'ENEMY PATHS: OFF', () => { this.app.toggleSetting('showPaths'); this.togglePause(true); })
        : null,
      button(this.cfg.mode === 'daily' ? 'QUIT (counts as your daily run)' : 'QUIT', () => {
        this.finalize();
        this.app.goTitle();
      }, 'ghost'),
    ));
  }

  // ---------------------------------------------------------------- run end

  /** Raw score times the difficulty multiplier, so ranks are comparable across levels. The server recomputes this by replay. */
  private finalScore(): number {
    return Math.round(this.run.totalScore * LEVELS[this.level].score);
  }

  private finalize(exiting = false): void {
    if (this.finalized) return;
    this.finalized = true;
    const run = this.run;
    const cfg = this.cfg;
    const score = this.finalScore();
    const before = new Set(this.app.profile.get().achievements);
    this.app.profile.update((p) => {
      p.runs++;
      p.totalFood += run.totals.food;
      if (cfg.mode === 'practice') {
        p.practiceBest = Math.max(p.practiceBest, score);
        const sm = new SkillModel(p.skill);
        run.outcomes.forEach((o) => sm.record(o));
        p.skill = sm.skill;
      }
      const earn = (id: string, ok: boolean) => ok && !p.achievements.includes(id) && p.achievements.push(id);
      earn('first', true);
      earn('immunity', run.phase === 'complete');
      earn('maggi', run.totals.enemies >= 4);
      earn('untouched', run.phase === 'complete' && run.totals.lives === 0);
      const streak = this.app.account.user?.streak.current ?? 0;
      if (cfg.mode === 'daily') {
        earn('streak3', streak >= 3);
        earn('streak7', streak >= 7);
      }
    });
    this.unlocked = this.app.profile.get().achievements.filter((a) => !before.has(a));
    if (this.daily) {
      const payload = { attemptId: this.daily.attemptId, ticks: run.tickCount, log: run.log };
      if (exiting) this.app.account.finishOnExit(payload);
      else {
        this.submission = this.app.account.finishDaily(payload);
        this.submission.catch(() => undefined); // the end screen reports failures
      }
    }
  }

  private shareText(): string {
    const run = this.run;
    const streak = this.app.account.user?.streak.current ?? 0;
    const courses = [0, 1, 2].map((i) => (run.outcomes[i]?.cleared ? ['🍳', '🍛', '🌙'][i] : '💀')).join('');
    const d = new Date(`${this.cfg.dateKey}T00:00:00Z`).toUTCString().slice(5, 11);
    return [`MESSED UP - ${this.cfg.mode === 'daily' ? d : 'practice'}${this.level === 'normal' ? '' : ` (${LEVELS[this.level].label})`}`, `${fmt(this.finalScore())} pts ${courses}`, this.cfg.mode === 'daily' ? `🔥 ${streak} day streak` : '', location.origin]
      .filter(Boolean)
      .join('\n');
  }

  private showEnd(): void {
    const run = this.run;
    const p = this.app.profile.get();
    const won = run.phase === 'complete';
    const rank = h('p', { class: 'hint' });
    const countdown = h('span', { class: 'mono' }, formatCountdown(msUntilNextIstMidnight(this.app.account.now())));
    const copied = h('p', { class: 'hint' });
    const finalEl = h('div', { class: 'final' }, fmt(this.finalScore()));
    const streak = this.app.account.user?.streak.current ?? 0;

    if (this.submission) {
      rank.textContent = 'VERIFYING SCORE...';
      this.submission.then(
        (res) => {
          finalEl.textContent = fmt(res.score);
          rank.textContent = `VERIFIED - RANK #${res.rank} TODAY`;
          rank.className = 'hint good';
        },
        (e: unknown) => {
          const offline = !(e instanceof ApiError) || e.status === 0 || e.status >= 500;
          rank.textContent = offline
            ? 'Saved on this device. It will be submitted next time you open the game.'
            : `This run could not be verified (${(e as ApiError).code}).`;
          rank.className = 'hint bad';
        },
      );
    }

    const badges = this.unlocked.map((id) => ACHIEVEMENTS.find((a) => a.id === id)).filter(Boolean)
      .map((a) => h('div', { class: 'unlock' }, `UNLOCKED: ${a!.name}`));

    this.showOverlay(h('div', { class: 'panel end' },
      h('h2', { class: `big ${won ? 'good' : 'bad'}` }, won ? `YOU SURVIVED ${WEEKDAY_NAMES[this.cfg.weekday]!.toUpperCase()}!` : pick(DEATH_LINES).toUpperCase()),
      finalEl,
      this.level === 'normal' ? null : h('p', { class: 'hint' }, `${fmt(run.totalScore)} base x ${LEVELS[this.level].score} (${LEVELS[this.level].label})`),
      h('p', { class: 'hint' }, `${run.stagesCleared}/3 courses - ${run.totals.food} dishes - best combo ${run.totals.maxCombo}`),
      this.cfg.mode === 'daily'
        ? h('p', { class: 'hint' }, `${streak} day streak. Next menu in `, countdown)
        : h('p', { class: 'hint' }, `Practice best ${fmt(p.practiceBest)}`),
      rank, ...badges,
      button('SHARE', async () => {
        try {
          await navigator.clipboard.writeText(this.shareText());
          copied.textContent = 'COPIED! Paste it in the group chat.';
        } catch {
          copied.textContent = this.shareText();
        }
      }, 'primary'),
      copied,
      this.cfg.mode === 'practice' ? button('PLAY AGAIN', () => this.app.startPractice(this.cfg.weekday, { skipPreview: true })) : null,
      button('HALL OF FAME', () => this.app.goHall()),
      button('MENU', () => this.app.goTitle(), 'ghost'),
    ));
    if (won) sfx.clear();
  }
}
