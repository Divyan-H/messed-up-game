/** Juice: crumb particles, floating score popups and screen shake. Pooled, so no per-frame allocation. */
const MAX_P = 96;
const MAX_POP = 12;

export interface Popup {
  text: string;
  x: number;
  y: number;
  life: number;
  color: string;
}

export class Effects {
  private readonly px = new Float32Array(MAX_P);
  private readonly py = new Float32Array(MAX_P);
  private readonly vx = new Float32Array(MAX_P);
  private readonly vy = new Float32Array(MAX_P);
  private readonly life = new Float32Array(MAX_P);
  private readonly colors: string[] = new Array(MAX_P).fill('#fff');
  private cursor = 0;
  readonly popups: Popup[] = Array.from({ length: MAX_POP }, () => ({ text: '', x: 0, y: 0, life: 0, color: '#fff' }));
  private popCursor = 0;
  shakeAmount = 0;
  reducedMotion = false;
  /** Crumb density: 'full', 'low' (about a third) or 'off'. Popups always show. */
  particles: 'full' | 'low' | 'off' = 'full';

  burst(x: number, y: number, color: string, count = 8, speed = 40): void {
    if (this.particles === 'off') return;
    if (this.particles === 'low') count = Math.max(2, Math.round(count / 3));
    for (let i = 0; i < count; i++) {
      const k = this.cursor++ % MAX_P;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.px[k] = x;
      this.py[k] = y;
      this.vx[k] = Math.cos(a) * s;
      this.vy[k] = Math.sin(a) * s - 20;
      this.life[k] = 0.35 + Math.random() * 0.3;
      this.colors[k] = color;
    }
  }

  popup(text: string, x: number, y: number, color = '#ffd23f'): void {
    const p = this.popups[this.popCursor++ % MAX_POP]!;
    p.text = text;
    p.x = x;
    p.y = y;
    p.life = 0.9;
    p.color = color;
  }

  shake(amount: number): void {
    if (!this.reducedMotion) this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  update(dt: number): void {
    for (let i = 0; i < MAX_P; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i]! -= dt;
      this.vy[i]! += 160 * dt;
      this.px[i]! += this.vx[i]! * dt;
      this.py[i]! += this.vy[i]! * dt;
    }
    for (const p of this.popups) if (p.life > 0) {
      p.life -= dt;
      p.y -= 18 * dt;
    }
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 18);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < MAX_P; i++) {
      if (this.life[i]! <= 0) continue;
      ctx.fillStyle = this.colors[i]!;
      ctx.fillRect(Math.round(this.px[i]!), Math.round(this.py[i]!), 2, 2);
    }
    ctx.textAlign = 'center';
    ctx.font = '8px "Press Start 2P", monospace';
    for (const p of this.popups) {
      if (p.life <= 0) continue;
      ctx.fillStyle = '#1a1c2c';
      ctx.fillText(p.text, Math.round(p.x) + 1, Math.round(p.y) + 1);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, Math.round(p.x), Math.round(p.y));
    }
  }

  clear(): void {
    this.life.fill(0);
    for (const p of this.popups) p.life = 0;
    this.shakeAmount = 0;
  }
}
