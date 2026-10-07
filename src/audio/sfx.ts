/** Tiny WebAudio synth: every sound is a few oscillator notes, so there are no audio files to download. */
type Wave = OscillatorType;

class Sfx {
  private ctx: AudioContext | null = null;
  muted = false;
  /** Master volume 0..1. */
  volume = 0.7;

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AC = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Call from a user gesture so browsers allow audio. */
  unlock(): void {
    this.ensure();
  }

  private note(freq: number, start: number, dur: number, wave: Wave = 'square', vol = 0.06, slideTo?: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const v = Math.max(0.0002, vol * this.volume * 1.4);
    gain.gain.setValueAtTime(v, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  eat(combo: number): void {
    this.note(440 * 2 ** (Math.min(combo, 12) / 12), 0, 0.07, 'square', 0.05);
  }
  snack(): void {
    [659, 880, 1175].forEach((f, i) => this.note(f, i * 0.06, 0.1));
  }
  maggi(): void {
    [262, 330, 392, 523, 659].forEach((f, i) => this.note(f, i * 0.05, 0.12, 'triangle', 0.08));
  }
  eatEnemy(): void {
    this.note(200, 0, 0.25, 'sawtooth', 0.07, 900);
  }
  hit(): void {
    this.note(300, 0, 0.45, 'sawtooth', 0.09, 60);
  }
  exitOpen(): void {
    [392, 523, 659, 784].forEach((f, i) => this.note(f, i * 0.07, 0.14, 'square', 0.06));
  }
  clear(): void {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.note(f, i * 0.09, 0.16, 'square', 0.06));
  }
  over(): void {
    [392, 330, 262, 196].forEach((f, i) => this.note(f, i * 0.18, 0.3, 'triangle', 0.09));
  }
  warden(): void {
    this.note(180, 0, 0.15, 'square', 0.07);
    this.note(150, 0.18, 0.2, 'square', 0.07);
  }
  click(): void {
    this.note(660, 0, 0.04, 'square', 0.04);
  }
  start(): void {
    [330, 440, 554].forEach((f, i) => this.note(f, i * 0.08, 0.1));
  }
}

export const sfx = new Sfx();
