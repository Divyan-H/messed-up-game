/** Canvas creation behind a seam, so the renderer also runs under node (see scripts/snapshot.ts). */
export type Surface = HTMLCanvasElement;

type Factory = (w: number, h: number) => Surface;

let factory: Factory = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

export function setCanvasFactory(f: Factory): void {
  factory = f;
}

export function createSurface(w: number, h: number): Surface {
  return factory(w, h);
}

export function ctx2d(c: Surface): CanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas not supported');
  ctx.imageSmoothingEnabled = false;
  return ctx;
}
