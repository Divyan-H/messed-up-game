/**
 * What the game remembers on this device: settings, Practice stats and achievements. No account needed.
 * Ranked data (nickname, streak, Daily results) lives on the server; see services/account.ts.
 */
import { loadJson, saveJson } from '../core/storage';
import { asLevel, type Level } from '../game/difficulty';

export type TextSize = 'small' | 'medium' | 'large';
export type ScaleMode = 'auto' | 'fill' | 'crisp';
export type PadMode = 'auto' | 'on' | 'off';
export type PadSide = 'left' | 'center' | 'right';
export type TouchControl = 'dpad' | 'joystick';
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
  touchControl: TouchControl;
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
  touchControl: 'dpad',
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
    touchControl: oneOf(r.touchControl, ['dpad', 'joystick'], d.touchControl),
    vibrate: bool(r.vibrate, d.vibrate),
    sound: bool(r.sound, d.sound),
    volume: vol,
  };
}

export interface Profile {
  v: 1;
  practiceBest: number;
  runs: number;
  totalFood: number;
  skill: number;
  achievements: string[];
  settings: Settings;
  /** True once the first-game guided tour has been seen (or skipped). */
  tourSeen: boolean;
}

const KEY = 'messedup:profile:v1';

/** Fields older versions kept on the device before ranked play moved to the server. */
const LEGACY_KEYS = ['nickname', 'streak', 'bestScore', 'daily'];

const defaults = (): Profile => ({
  v: 1,
  practiceBest: 0,
  runs: 0,
  totalFood: 0,
  skill: 0.5,
  achievements: [],
  settings: { ...DEFAULT_SETTINGS },
  tourSeen: false,
});

export class ProfileStore {
  private data: Profile;

  constructor() {
    this.data = ProfileStore.load();
    // another tab saved: pick up its changes so this tab never writes stale data back over them
    globalThis.addEventListener?.('storage', (e: StorageEvent) => {
      if (e.key === KEY) this.data = ProfileStore.load();
    });
  }

  private static load(): Profile {
    const loaded = loadJson<Profile>(KEY, defaults());
    const p = { ...defaults(), ...loaded, settings: sanitizeSettings(loaded.settings) };
    for (const k of LEGACY_KEYS) delete (p as unknown as Record<string, unknown>)[k];
    return p;
  }

  get(): Readonly<Profile> {
    return this.data;
  }

  /** Read-modify-write against the latest saved copy, so two open tabs do not overwrite each other. */
  update(fn: (p: Profile) => void): void {
    this.data = ProfileStore.load();
    fn(this.data);
    this.save();
  }

  private save(): void {
    saveJson(KEY, this.data);
  }
}
