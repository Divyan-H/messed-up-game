/** Grid-locked movement with sub-tile interpolation, shared by the player and every enemy. */
export interface Mover {
  col: number;
  row: number;
  /** Direction of travel; (0,0) means standing on a tile centre. */
  dx: number;
  dy: number;
  /** Progress 0..1 from (col,row) toward (col+dx,row+dy). */
  t: number;
  /** Tiles per second. */
  speed: number;
}

export function makeMover(col: number, row: number, speed: number): Mover {
  return { col, row, dx: 0, dy: 0, t: 0, speed };
}

export const moverX = (m: Mover): number => m.col + m.dx * m.t;
export const moverY = (m: Mover): number => m.row + m.dy * m.t;

/** Turn around in place (legal at any moment, like Pac-Man). */
export function reverseMover(m: Mover): void {
  if (m.dx === 0 && m.dy === 0) return;
  m.col += m.dx;
  m.row += m.dy;
  m.t = 1 - m.t;
  m.dx = -m.dx;
  m.dy = -m.dy;
}

/**
 * Advances a mover by `dt`. `decide` is called whenever the mover sits on a tile centre
 * and must set dx/dy to a legal direction (or (0,0) to stop).
 */
export function advanceMover(m: Mover, dt: number, decide: (m: Mover) => void): void {
  let budget = m.speed * dt;
  let guard = 0;
  while (budget > 1e-9 && guard++ < 8) {
    if (m.dx === 0 && m.dy === 0) {
      decide(m);
      if (m.dx === 0 && m.dy === 0) return;
    }
    const need = 1 - m.t;
    if (budget >= need) {
      budget -= need;
      m.col += m.dx;
      m.row += m.dy;
      m.t = 0;
      decide(m);
      if (m.dx === 0 && m.dy === 0) return;
    } else {
      m.t += budget;
      budget = 0;
    }
  }
}
