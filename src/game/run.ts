/**
 * A Run is one play session: three courses (Breakfast, Lunch, Dinner) that share stomachs,
 * score and perks. It is a small state machine that drives Stage objects and is fully
 * deterministic: (config + per-tick inputs + perk picks) => identical outcome.
 */
import { hashString, mulberry32, type Rng } from '../core/rng';
import { dirFromCode, type InputCode } from '../core/types';
import { COURSE_COUNT, DT, MAX_STOMACHS, START_STOMACHS } from './config';
import { LEVELS, stageDifficulty, type Level, type StageOutcome } from './difficulty';
import { Stage, type GameEvent } from './stage';
import { freshModifiers, offerPerks, PERKS, type Perk, type RunModifiers } from './perks';

export type RunPhase = 'intro' | 'playing' | 'clear' | 'perk' | 'dying' | 'over' | 'complete';
export type RunMode = 'daily' | 'practice';

export interface RunConfig {
  mode: RunMode;
  seed: number;
  weekday: number;
  dateKey: string;
  /** Enemy-speed multiplier from the adaptive model (1 for Daily). */
  adaptive: number;
  /** Player-chosen difficulty (defaults to normal). */
  level?: Level;
}

export type RunEvent = GameEvent | { t: 'phase'; phase: RunPhase } | { t: 'stageStart'; course: number };

export interface ReplayLog {
  dirs: Array<[tick: number, code: InputCode]>;
  perks: Array<[tick: number, id: string]>;
}

const INTRO_SECONDS = 1.9;
const CLEAR_SECONDS = 2.4;
const DYING_SECONDS = 1.4;

export class Run {
  readonly mods: RunModifiers = freshModifiers();
  readonly owned = new Set<string>();
  readonly events: RunEvent[] = [];
  readonly log: ReplayLog = { dirs: [], perks: [] };
  readonly outcomes: StageOutcome[] = [];
  private readonly rng: Rng;

  phase: RunPhase = 'intro';
  stage!: Stage;
  stageIndex = 0;
  stomachs = START_STOMACHS;
  perkOffer: Perk[] = [];
  tickCount = 0;
  stagesCleared = 0;
  private bank = 0;
  private banked = false;
  private timer = INTRO_SECONDS;
  private lastCode: InputCode = 0;
  totals = { food: 0, enemies: 0, lives: 0, maxCombo: 0, time: 0 };

  constructor(readonly cfg: RunConfig) {
    this.rng = mulberry32(hashString(`${cfg.seed}|run`));
    this.stomachs = LEVELS[cfg.level ?? 'normal'].stomachs;
    this.startStage();
  }

  get totalScore(): number {
    return this.bank + (this.banked ? 0 : this.stage.score);
  }

  get finished(): boolean {
    return this.phase === 'over' || this.phase === 'complete';
  }

  get phaseProgress(): number {
    const total = this.phase === 'intro' ? INTRO_SECONDS : this.phase === 'clear' ? CLEAR_SECONDS : DYING_SECONDS;
    return 1 - Math.max(0, this.timer) / total;
  }

  private setPhase(p: RunPhase, seconds = 0): void {
    this.phase = p;
    this.timer = seconds;
    this.events.push({ t: 'phase', phase: p });
  }

  private startStage(): void {
    const { cfg } = this;
    this.stage = new Stage({
      layoutSeed: hashString(`${cfg.seed}|layout|${this.stageIndex}`),
      simSeed: hashString(`${cfg.seed}|sim|${this.stageIndex}`),
      weekday: cfg.weekday,
      course: this.stageIndex,
      difficulty: stageDifficulty(cfg.weekday, this.stageIndex, cfg.adaptive, cfg.level),
      mods: this.mods,
      stomachs: this.stomachs,
    });
    this.banked = false;
    this.events.push({ t: 'stageStart', course: this.stageIndex });
    this.setPhase('intro', INTRO_SECONDS);
  }

  /** Advance exactly one fixed 1/60s tick. */
  tick(code: InputCode): void {
    if (this.finished) return;
    if (code !== this.lastCode) {
      this.log.dirs.push([this.tickCount, code]);
      this.lastCode = code;
    }
    this.tickCount++;
    switch (this.phase) {
      case 'intro':
        if ((this.timer -= DT) <= 0) this.setPhase('playing');
        break;
      case 'playing':
        this.stage.tick(DT, dirFromCode(code));
        for (const e of this.stage.drainEvents()) this.events.push(e);
        if (this.stage.state === 'cleared') this.endStage(true);
        else if (this.stage.state === 'lost') this.endStage(false);
        break;
      case 'clear':
        if ((this.timer -= DT) <= 0) {
          if (this.stageIndex >= COURSE_COUNT - 1) this.setPhase('complete');
          else {
            this.perkOffer = offerPerks(this.rng, this.owned);
            this.setPhase('perk');
          }
        }
        break;
      case 'dying':
        if ((this.timer -= DT) <= 0) this.setPhase('over');
        break;
      default:
        break;
    }
  }

  private endStage(cleared: boolean): void {
    const s = this.stage;
    this.bank += s.score;
    this.banked = true;
    this.stomachs = Math.max(0, s.stomachs);
    this.totals.food += s.stats.foodEaten;
    this.totals.enemies += s.stats.enemiesEaten;
    this.totals.lives += s.stats.livesLost;
    this.totals.maxCombo = Math.max(this.totals.maxCombo, s.stats.maxCombo);
    this.totals.time += s.stats.time;
    this.outcomes.push({ cleared, livesLost: s.stats.livesLost, time: s.stats.time, parTime: s.params.difficulty.parTime });
    if (cleared) {
      this.stagesCleared++;
      this.setPhase('clear', CLEAR_SECONDS);
    } else {
      this.setPhase('dying', DYING_SECONDS);
    }
  }

  choosePerk(id: string): boolean {
    if (this.phase !== 'perk') return false;
    const perk = this.perkOffer.find((p) => p.id === id) ?? PERKS.find((p) => p.id === id && this.perkOffer.length === 0);
    if (!perk) return false;
    perk.apply(this.mods);
    this.owned.add(perk.id);
    if (this.mods.extraStomachs > 0) {
      this.stomachs = Math.min(MAX_STOMACHS, this.stomachs + this.mods.extraStomachs);
      this.mods.extraStomachs = 0;
    }
    this.log.perks.push([this.tickCount, id]);
    this.perkOffer = [];
    this.stageIndex++;
    this.startStage();
    return true;
  }

  drainEvents(): RunEvent[] {
    return this.events.splice(0, this.events.length);
  }
}

/** Longest run the game (and the server's verifier) will simulate: 15 minutes of play. */
export const MAX_RUN_TICKS = 60 * 60 * 15;

/**
 * Re-simulates a recorded run from its log. Equal results prove the run is reproducible/verifiable.
 * `untilTick` stops early, which replays a run that was quit (or abandoned) part-way through.
 */
export function replayRun(cfg: RunConfig, log: ReplayLog, maxTicks = MAX_RUN_TICKS, untilTick = maxTicks): Run {
  const run = new Run(cfg);
  const limit = Math.min(maxTicks, untilTick);
  let di = 0;
  let pi = 0;
  let code: InputCode = 0;
  const applyPerks = () => {
    while (pi < log.perks.length && log.perks[pi]![0] <= run.tickCount) run.choosePerk(log.perks[pi++]![1]);
  };
  while (!run.finished && run.tickCount < limit) {
    applyPerks();
    while (di < log.dirs.length && log.dirs[di]![0] <= run.tickCount) code = log.dirs[di++]![1];
    run.tick(code);
  }
  applyPerks();
  return run;
}
