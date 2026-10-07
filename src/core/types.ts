/** Direction index: 0 up, 1 right, 2 down, 3 left. */
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;

export interface Dir {
  readonly dx: number;
  readonly dy: number;
}

export const NO_DIR: Dir = { dx: 0, dy: 0 };
export const DIR_LIST: readonly Dir[] = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

/** Compact input code used in replay logs: 0 none, 1 up, 2 right, 3 down, 4 left. */
export type InputCode = 0 | 1 | 2 | 3 | 4;

export function dirFromCode(code: InputCode): Dir {
  return code === 0 ? NO_DIR : DIR_LIST[code - 1]!;
}

export function codeFromDir(d: Dir): InputCode {
  for (let i = 0; i < 4; i++) if (DX[i] === d.dx && DY[i] === d.dy) return (i + 1) as InputCode;
  return 0;
}
