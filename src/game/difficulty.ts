/** Static difficulty curve (by weekday + course) and the adaptive player-skill model. */
import { tierOf } from './config';
import type { EnemyKind } from './enemies';

/** Player-chosen difficulty. Part of the run config, so replays and the bot stay deterministic. */
export type Level = 'easy' | 'normal' | 'hard';
export const LEVEL_IDS: readonly Level[] = ['easy', 'normal', 'hard'];

export interface LevelDef {
  label: string;
  blurb: string;
  /** Multiplies enemy speed. */
  speed: number;
  /** Multiplies the gap between enemy releases (bigger = calmer). */
  release: number;
  /** Multiplies how long the hunger bar lasts. */
  hunger: number;
  /** Dishes added to (or removed from) each course. */
  food: number;
  /** Seconds added to the Maggi power-up. */
  maggi: number;
  stomachs: number;
  /** Upper bound for enemy speed as a fraction of the player's. */
  cap: number;
  /** Applied to the final score so ranks stay comparable across levels. */
  score: number;
}

export const LEVELS: Record<Level, LevelDef> = {
  easy: { label: 'EASY', blurb: 'Slower dishes, fewer dishes to eat, 4 stomachs, longer Maggi, no boss. Score x0.6.', speed: 0.72, release: 1.6, hunger: 1.3, food: -2, maggi: 2, stomachs: 4, cap: 0.9, score: 0.6 },
  normal: { label: 'NORMAL', blurb: 'The intended recipe. Score x1.', speed: 1, release: 1, hunger: 1, food: 0, maggi: 0, stomachs: 3, cap: 0.9, score: 1 },
  hard: { label: 'HARD', blurb: 'Faster dishes, more dishes to eat, quicker releases, shorter Maggi, hungrier you. Score x1.2.', speed: 1.08, release: 0.75, hunger: 0.8, food: 2, maggi: -1.5, stomachs: 3, cap: 0.96, score: 1.2 },
};

export const asLevel = (v: unknown): Level => (v === 'easy' || v === 'hard' ? v : 'normal');

export interface StageDifficulty {
  tier: number;
  course: number;
  roster: EnemyKind[];
  /** Enemy speed as a fraction of player speed. */
  enemySpeedRatio: number;
  releaseInterval: number;
  foodCount: number;
  maggiSeconds: number;
  hungerSeconds: number;
  parTime: number;
}

export function stageDifficulty(weekday: number, course: number, adaptive = 1, level: Level = 'normal'): StageDifficulty {
  const L = LEVELS[level];
  const tier = tierOf(weekday);
  const roster: EnemyKind[] = ['blob', 'chapati'];
  if (tier >= 1 || course >= 2 || level === 'hard') roster.push('curry');
  if (tier >= 2 || (tier >= 1 && course >= 1) || (level === 'hard' && course >= 1)) roster.push('special');
  if (level === 'easy' && roster.length > 3) roster.pop(); // the boss takes the day off
  const base = 0.48 + 0.018 * tier + 0.013 * course;
  return {
    tier,
    course,
    roster,
    enemySpeedRatio: Math.min(L.cap, base * adaptive * L.speed),
    releaseInterval: Math.max(1.2, (3.6 - 0.25 * tier - 0.2 * course) * L.release),
    foodCount: 12 + course + Math.floor(tier / 2) + L.food,
    maggiSeconds: Math.max(3.5, 7 - 0.2 * tier + L.maggi),
    hungerSeconds: 100 * L.hunger,
    parTime: 45 + course * 3,
  };
}

export interface StageOutcome {
  cleared: boolean;
  livesLost: number;
  time: number;
  parTime: number;
}

/**
 * Dynamic Difficulty Adjustment: keeps an exponential moving average of how well the
 * player is doing (0..1) and nudges enemy speed so play stays "challenging but fair".
 * Only used in Practice mode - the Daily Run must be identical for everyone.
 */
export class SkillModel {
  constructor(public skill = 0.5) {}

  record(o: StageOutcome): number {
    const perf = o.cleared
      ? Math.max(0.15, Math.min(1, 0.85 - 0.25 * o.livesLost + 0.15 * Math.max(0, 1 - o.time / o.parTime)))
      : 0.05;
    this.skill = this.skill * 0.65 + perf * 0.35;
    return this.skill;
  }

  /** 0.92 (struggling) .. 1.10 (cruising) multiplier on enemy speed. */
  multiplier(): number {
    return 0.92 + 0.18 * this.skill;
  }

  label(): 'GENTLE' | 'NORMAL' | 'SPICY' {
    return this.skill < 0.4 ? 'GENTLE' : this.skill < 0.7 ? 'NORMAL' : 'SPICY';
  }
}
