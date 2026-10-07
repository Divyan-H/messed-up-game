/**
 * Procedural dining-hall layout. Instead of carving corridors, we *furnish* the room: sets of tables
 * with chairs, stools, booths, buffet counters and planters are dropped onto the floor one at a time.
 * The walls the player and enemies bump into are simply the footprints of that furniture.
 *
 * Constraint-based placement (a small constraint-satisfaction / rejection-sampling generator):
 *   1. every piece must fit inside the room and stay clear of the kitchen, the start and the corners;
 *   2. pieces keep at least one empty tile between them (the aisles) unless they are flush against a wall;
 *   3. a piece is rejected if it would cut the floor into disconnected islands (checked with BFS).
 * Everything derives from the seeded RNG, so a date always gives the same hall.
 */
import { COLS, ROWS } from './config';
import { randInt, type Rng } from '../core/rng';

export type Facing = 'n' | 'e' | 's' | 'w';
export type PieceKind = 'table' | 'round' | 'chair' | 'stool' | 'bench' | 'counter' | 'planter' | 'crate';

/** One solid thing on the floor. Coordinates are in tiles. */
export interface Piece {
  kind: PieceKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Chairs/benches/stools: the direction the sitter faces (towards the table). */
  facing?: Facing;
  /** Tables sharing a set id are one group (used for matching chairs and cloth). */
  set: number;
}

/** Template glyphs: T table, R round table, c chair, s stool, b bench, F buffet, P planter, X crate, space = empty. */
interface Template {
  name: string;
  rows: string[];
  weight: number;
  /** Must touch the left/right wall (booths). */
  wall?: boolean;
  /** Never rotate (it has a meaningful orientation). */
  fixed?: boolean;
}

export const TEMPLATES: Template[] = [
  { name: 'two-top', rows: [' c ', 'cTc', ' c '], weight: 4 },
  { name: 'pair', rows: ['cc', 'TT', 'cc'], weight: 5 },
  { name: 'family', rows: ['ccc', 'TTT', 'TTT', 'ccc'], weight: 3 },
  { name: 'long', rows: ['cccc', 'TTTT', 'cccc'], weight: 3 },
  { name: 'round', rows: [' ss ', 'sRRs', 'sRRs', ' ss '], weight: 4 },
  { name: 'big', rows: [' cc ', 'cTTc', 'cTTc', ' cc '], weight: 2 },
  { name: 'diner', rows: ['cT', 'cT', 'cT'], weight: 2 },
  { name: 'booth', rows: ['bTT', 'bTT', 'bTT'], weight: 5, wall: true },
  { name: 'booth-short', rows: ['bT', 'bT'], weight: 3, wall: true },
  { name: 'buffet', rows: ['FFF'], weight: 2 },
  { name: 'buffet-long', rows: ['FFFF'], weight: 1 },
  { name: 'small-table', rows: ['T'], weight: 3 },
  { name: 'stool', rows: ['s'], weight: 1 },
  { name: 'planter', rows: ['P'], weight: 2 },
  { name: 'crate', rows: ['X'], weight: 2 },
];

const inRoom = (x: number, y: number): boolean => x >= 1 && y >= 1 && x <= COLS - 2 && y <= ROWS - 2;

/** Tiles that must stay open: the kitchen where dishes spawn, the start, and the four corners. */
export function reservedTiles(): Set<number> {
  const out = new Set<number>();
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.add(y * COLS + x);
  };
  add(6, 7, 12, 11); // kitchen + rug
  add(7, 17, 11, 19); // where the player starts
  add(1, 1, 2, 2);
  add(COLS - 3, 1, COLS - 2, 2);
  add(1, ROWS - 3, 2, ROWS - 2);
  add(COLS - 3, ROWS - 3, COLS - 2, ROWS - 2);
  return out;
}

function transpose(rows: string[]): string[] {
  const out: string[] = [];
  for (let x = 0; x < rows[0]!.length; x++) out.push(rows.map((r) => r[x]).join(''));
  return out;
}
const flipX = (rows: string[]): string[] => rows.map((r) => [...r].reverse().join(''));
const flipY = (rows: string[]): string[] => [...rows].reverse();

const DIRS: [number, number, Facing][] = [
  [0, -1, 'n'],
  [1, 0, 'e'],
  [0, 1, 's'],
  [-1, 0, 'w'],
];

/** Turn a template placed at (ox, oy) into pieces (merging table cells into one rectangle). */
function piecesOf(rows: string[], ox: number, oy: number, set: number, rng: Rng): Piece[] {
  const out: Piece[] = [];
  const at = (x: number, y: number): string => (rows[y] && rows[y]![x]) || ' ';
  const isTable = (c: string) => c === 'T' || c === 'R' || c === 'F';

  for (const glyph of ['T', 'R', 'F']) {
    let x0 = 99, y0 = 99, x1 = -1, y1 = -1;
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y]!.length; x++) {
        if (rows[y]![x] !== glyph) continue;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
    }
    if (x1 < 0) continue;
    const kind: PieceKind = glyph === 'T' ? 'table' : glyph === 'R' ? 'round' : 'counter';
    out.push({ kind, x: ox + x0, y: oy + y0, w: x1 - x0 + 1, h: y1 - y0 + 1, set });
  }

  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y]!.length; x++) {
      const c = rows[y]![x]!;
      if (c === ' ' || isTable(c)) continue;
      const kind: PieceKind = c === 'c' ? 'chair' : c === 's' ? 'stool' : c === 'b' ? 'bench' : c === 'P' ? 'planter' : 'crate';
      let facing: Facing | undefined;
      if (kind === 'chair' || kind === 'stool' || kind === 'bench') {
        for (const [dx, dy, f] of DIRS) if (isTable(at(x + dx, y + dy))) facing = f;
        facing ??= DIRS[randInt(rng, 4)]![2]; // a stray chair faces anywhere
      }
      const piece: Piece = { kind, x: ox + x, y: oy + y, w: 1, h: 1, set };
      if (facing) piece.facing = facing;
      out.push(piece);
    }
  }
  // merge vertically/horizontally adjacent bench cells into one long bench
  return mergeBenches(out);
}

function mergeBenches(pieces: Piece[]): Piece[] {
  const benches = pieces.filter((p) => p.kind === 'bench').sort((a, b) => a.y - b.y || a.x - b.x);
  const rest = pieces.filter((p) => p.kind !== 'bench');
  const merged: Piece[] = [];
  for (const b of benches) {
    const prev = merged[merged.length - 1];
    if (prev && prev.x === b.x && prev.w === b.w && prev.y + prev.h === b.y && prev.facing === b.facing) prev.h += 1;
    else merged.push({ ...b });
  }
  return [...rest, ...merged];
}

export interface FurnitureLayout {
  walls: Uint8Array;
  pieces: Piece[];
}

/** Paint the pieces' footprints into a wall mask (border walls included). */
export function wallsFromPieces(pieces: Piece[]): Uint8Array {
  const walls = new Uint8Array(COLS * ROWS);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!inRoom(x, y)) walls[y * COLS + x] = 1;
  for (const p of pieces) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) walls[y * COLS + x] = 1;
  return walls;
}

/** Flood fill from the start: true when every open tile can be reached. */
function connected(walls: Uint8Array, from: number): boolean {
  const seen = new Uint8Array(walls.length);
  const stack = [from];
  seen[from] = 1;
  let reached = 0;
  while (stack.length) {
    const t = stack.pop()!;
    reached++;
    const x = t % COLS;
    const y = (t / COLS) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const n = ny * COLS + nx;
      if (walls[n] || seen[n]) continue;
      seen[n] = 1;
      stack.push(n);
    }
  }
  let open = 0;
  for (let i = 0; i < walls.length; i++) if (!walls[i]) open++;
  return reached === open;
}

function pickTemplate(rng: Rng): Template {
  const total = TEMPLATES.reduce((s, t) => s + t.weight, 0);
  let r = rng() * total;
  for (const t of TEMPLATES) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return TEMPLATES[0]!;
}

/** Fraction of the room's tiles that should end up covered by furniture. */
const TARGET_FILL = 0.32;
/** Chance that a set may be pushed right up against its neighbours (aisles then come from the BFS rule). */
const TOUCH_CHANCE = 0.4;
const START = 19 * COLS + 9;

function furnishOnce(rng: Rng): FurnitureLayout {
  const reserved = reservedTiles();
  const pieces: Piece[] = [];
  const solid = new Uint8Array(COLS * ROWS); // furniture only (not border)
  let covered = 0;
  const room = (COLS - 2) * (ROWS - 2);
  let set = 0;

  for (let attempt = 0; attempt < 1500 && covered / room < TARGET_FILL; attempt++) {
    const t = pickTemplate(rng);
    let rows = t.rows;
    if (!t.fixed && rng() < 0.5) rows = transpose(rows);
    if (rng() < 0.5) rows = flipX(rows);
    if (rng() < 0.5) rows = flipY(rows);
    const h = rows.length;
    const w = rows[0]!.length;

    let ox: number;
    if (t.wall) {
      // booths sit flush with a side wall, with the bench against it
      const left = rng() < 0.5;
      const benchOnLeft = rows.every((r) => r[0] === 'b');
      const benchOnRight = rows.every((r) => r[w - 1] === 'b');
      if (left && !benchOnLeft) rows = flipX(rows);
      if (!left && !benchOnRight) rows = flipX(rows);
      ox = left ? 1 : COLS - 1 - w;
    } else {
      ox = 1 + randInt(rng, COLS - 2 - w + 1);
    }
    const oy = 1 + randInt(rng, ROWS - 2 - h + 1);

    const touch = rng() < TOUCH_CHANCE;
    const cells: number[] = [];
    let ok = true;
    for (let y = 0; y < h && ok; y++) {
      for (let x = 0; x < w && ok; x++) {
        if (rows[y]![x] === ' ') continue;
        const gx = ox + x;
        const gy = oy + y;
        const tile = gy * COLS + gx;
        if (!inRoom(gx, gy) || reserved.has(tile)) { ok = false; break; }
        if (solid[tile]) { ok = false; break; }
        // usually keep one empty tile between sets (diagonals included); border walls are exempt
        for (let dy = -1; dy <= 1 && ok && !touch; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = gx + dx;
            const ny = gy + dy;
            if (!inRoom(nx, ny)) continue;
            const n = ny * COLS + nx;
            if (solid[n] && !cellsHas(cells, n)) { ok = false; break; }
          }
        }
        cells.push(tile);
      }
    }
    if (!ok || !cells.length) continue;

    const trial = solid.slice();
    for (const c of cells) trial[c] = 1;
    const walls = new Uint8Array(trial);
    for (let i = 0; i < walls.length; i++) if (!inRoom(i % COLS, (i / COLS) | 0)) walls[i] = 1;
    if (!connected(walls, START)) continue;

    solid.set(trial);
    covered += cells.length;
    pieces.push(...piecesOf(rows, ox, oy, set++, rng));
  }
  plugDeadEnds(pieces, reserved, rng);
  plugPockets(pieces, reserved, rng);
  return { walls: wallsFromPieces(pieces), pieces };
}

function cellsHas(cells: number[], n: number): boolean {
  return cells.includes(n);
}

/**
 * Dead-end pockets are death traps against chasing enemies (and look like gaps in the furniture),
 * so each one is plugged with something you would really find stuffed in a corner: a planter, a crate
 * or a spare stool. Filling a dead end can never disconnect the floor, so the layout stays valid.
 */
function plugDeadEnds(pieces: Piece[], reserved: Set<number>, rng: Rng): void {
  const STUFF: PieceKind[] = ['planter', 'crate', 'stool', 'crate', 'planter'];
  for (let pass = 0; pass < 40; pass++) {
    const walls = wallsFromPieces(pieces);
    let plugged = 0;
    for (let y = 1; y < ROWS - 1; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        const t = y * COLS + x;
        if (walls[t] || reserved.has(t)) continue;
        let open = 0;
        for (const [dx, dy] of DIRS) if (!walls[(y + dy) * COLS + x + dx]) open++;
        if (open > 1) continue;
        const kind = STUFF[randInt(rng, STUFF.length)]!;
        const piece: Piece = { kind, x, y, w: 1, h: 1, set: 1000 + pieces.length };
        if (kind === 'stool') piece.facing = DIRS[randInt(rng, 4)]![2];
        pieces.push(piece);
        walls[t] = 1;
        plugged++;
      }
    }
    if (!plugged) return;
  }
}

const POCKET_MAX = 14;

/**
 * Open tiles that sit in a small cut-off pocket: removing one single tile (an "articulation" tile)
 * would separate them from the start. A small room with one doorway is a trap when something is chasing you,
 * so these are plugged with clutter, or the whole layout is re-rolled when the pocket holds a reserved tile.
 */
export function smallPockets(walls: Uint8Array): number[][] {
  // Tarjan's articulation points on the floor graph, rooted at the start tile (iterative DFS).
  const n = walls.length;
  const disc = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const parent = new Int32Array(n).fill(-1);
  const order: number[] = [];
  const iter = new Int8Array(n);
  const stack = [START];
  let time = 0;
  disc[START] = low[START] = time++;
  order.push(START);
  while (stack.length) {
    const u = stack[stack.length - 1]!;
    if (iter[u]! < 4) {
      const [dx, dy] = DIRS[iter[u]!++]!;
      const v = ((u / COLS) | 0) * COLS + (u % COLS) + dy * COLS + dx;
      if (walls[v]) continue;
      if (disc[v] < 0) {
        parent[v] = u;
        disc[v] = low[v] = time++;
        order.push(v);
        stack.push(v);
      } else if (v !== parent[u]) {
        low[u] = Math.min(low[u]!, disc[v]!);
      }
    } else {
      stack.pop();
      const p = parent[u]!;
      if (p >= 0) low[p] = Math.min(low[p]!, low[u]!);
    }
  }
  // subtree sizes (children appear after parents in `order`)
  const size = new Int32Array(n);
  for (let i = order.length - 1; i >= 0; i--) {
    const u = order[i]!;
    size[u]! += 1;
    if (parent[u]! >= 0) size[parent[u]!]! += size[u]!;
  }
  const pockets: number[][] = [];
  for (const c of order) {
    const u = parent[c]!;
    if (u < 0 || low[c]! < disc[u]! || size[c]! > POCKET_MAX) continue;
    // the pocket is c's DFS subtree: everything discovered in [disc[c], disc[c] + size[c])
    const start = disc[c]!;
    pockets.push(order.slice(start, start + size[c]!));
  }
  return pockets;
}

function plugPockets(pieces: Piece[], reserved: Set<number>, rng: Rng): void {
  const STUFF: PieceKind[] = ['planter', 'crate', 'crate', 'stool'];
  for (let pass = 0; pass < 12; pass++) {
    const pockets = smallPockets(wallsFromPieces(pieces)).filter((c) => !c.some((t) => reserved.has(t)));
    if (!pockets.length) return;
    for (const t of new Set(pockets.flat())) {
      const piece: Piece = { kind: STUFF[randInt(rng, STUFF.length)]!, x: t % COLS, y: (t / COLS) | 0, w: 1, h: 1, set: 2000 + pieces.length };
      if (piece.kind === 'stool') piece.facing = DIRS[randInt(rng, 4)]![2];
      pieces.push(piece);
    }
  }
}

/** Furnish the hall; re-rolls (deterministically, from the same RNG stream) until no trap pockets remain. */
export function furnishHall(rng: Rng): FurnitureLayout {
  let best: FurnitureLayout | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < 80; i++) {
    const layout = furnishOnce(rng);
    const score = smallPockets(layout.walls).reduce((n, c) => n + c.length, 0);
    if (score < bestScore) {
      best = layout;
      bestScore = score;
    }
    if (score === 0) break;
  }
  return best!;
}
