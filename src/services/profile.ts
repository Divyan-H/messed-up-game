/** Everything the game remembers about the player on this device (no account needed). */
import { loadJson, saveJson } from '../core/storage';
import { asLevel, type Level } from '../game/difficulty';
import { emptyStreak, type StreakState } from './streak';

export interface DailyRecord {
  date: string;
  score: number;
  stages: number;
  weekday: number;
  level?: Level;
}

export type TextSize = 'small' | 'medium' | 'large';
export type ScaleMode = 'auto' | 'fill' | 'crisp';
export type PadMode = 'auto' | 'on' | 'off';
export type PadSide = 'left' | 'center' | 'right';
export type FxLevel = 'full' | 'low' | 'off';
export type FontMode = 'pixel' | 'clear';

export interface Settings {
  // gameplay
  difficulty: Level;
  adaptive: boolean;
  showPaths: boolean;
  tips: boolean;
  menuPreview: boolean;
  // display
  crt: boolean;
  highContrast: boolean;
  font: FontMode;
  textSize: TextSize;
  scaleMode: ScaleMode;
  particles: FxLevel;
  reducedMotion: boolean;
  showFps: boolean;
  // controls
  pad: PadMode;
  padSide: PadSide;
  vibrate: boolean;
  // audio
  sound: boolean;
  volume: number;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  difficulty: 'normal',
  adaptive: true,
  showPaths: false,
  tips: true,
  menuPreview: true,
  crt: true,
  highContrast: false,
  font: 'pixel',
  textSize: 'medium',
  scaleMode: 'auto',
  particles: 'full',
  reducedMotion: false,
  showFps: false,
  pad: 'auto',
  padSide: 'center',
  vibrate: true,
  sound: true,
  volume: 0.7,
};

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** Accepts anything read from storage and returns a fully valid Settings object (unknown or bad values fall back to defaults). */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const vol = typeof r.volume === 'number' && Number.isFinite(r.volume) ? Math.min(1, Math.max(0, r.volume)) : d.volume;
  return {
    difficulty: asLevel(r.difficulty),
    adaptive: bool(r.adaptive, d.adaptive),
    showPaths: bool(r.showPaths, d.showPaths),
    tips: bool(r.tips, d.tips),
    menuPreview: bool(r.menuPreview, d.menuPreview),
    crt: bool(r.crt, d.crt),
    highContrast: bool(r.highContrast, d.highContrast),
    font: oneOf(r.font, ['pixel', 'clear'], d.font),
    textSize: oneOf(r.textSize, ['small', 'medium', 'large'], d.textSize),
    scaleMode: oneOf(r.scaleMode, ['auto', 'fill', 'crisp'], d.scaleMode),
    particles: oneOf(r.particles, ['full', 'low', 'off'], d.particles),
    reducedMotion: bool(r.reducedMotion, d.reducedMotion),
    showFps: bool(r.showFps, d.showFps),
    pad: oneOf(r.pad, ['auto', 'on', 'off'], d.pad),
    padSide: oneOf(r.padSide, ['left', 'center', 'right'], d.padSide),
    vibrate: bool(r.vibrate, d.vibrate),
    sound: bool(r.sound, d.sound),
    volume: vol,
  };
}

export interface Profile {
  v: 1;
  nickname: string;
  streak: StreakState;
  bestScore: number;
  practiceBest: number;
  runs: number;
  totalFood: number;
  daily: Record<string, DailyRecord>;
  skill: number;
  achievements: string[];
  settings: Settings;
  /** True once the first-game guided tour has been seen (or skipped). */
  tourSeen: boolean;
}

const KEY = 'messedup:profile:v1';

const ADJ = ['Spicy', 'Sleepy', 'Soggy', 'Crispy', 'Hungry', 'Salty', 'Saucy', 'Lazy', 'Cranky', 'Sneaky'];
const NOUN = ['Idli', 'Dosa', 'Egg', 'Rasam', 'Chai', 'Puff', 'Rice', 'Banana', 'Curd', 'Vada'];

export function sanitizeName(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_ -]/g, '').trim().slice(0, 12);
}

export function randomName(): string {
  const r = (n: number) => Math.floor(Math.random() * n);
  return sanitizeName(`${ADJ[r(ADJ.length)]}${NOUN[r(NOUN.length)]}${10 + r(90)}`);
}

const defaults = (): Profile => ({
  v: 1,
  nickname: '',
  streak: emptyStreak(),
  bestScore: 0,
  practiceBest: 0,
  runs: 0,
  totalFood: 0,
  daily: {},
  skill: 0.5,
  achievements: [],
  settings: { ...DEFAULT_SETTINGS },
  tourSeen: false,
});

export class ProfileStore {
  private data: Profile;

  constructor() {
    const loaded = loadJson<Profile>(KEY, defaults());
    this.data = { ...defaults(), ...loaded, settings: sanitizeSettings(loaded.settings) };
    if (!this.data.nickname) {
      this.data.nickname = randomName();
      this.save();
    }
  }

  get(): Readonly<Profile> {
    return this.data;
  }

  update(fn: (p: Profile) => void): void {
    fn(this.data);
    this.save();
  }

  private save(): void {
    // keep the history bounded so localStorage never grows without limit
    const keys = Object.keys(this.data.daily).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete this.data.daily[k];
    saveJson(KEY, this.data);
  }
}
