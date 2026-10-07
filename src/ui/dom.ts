/** Minimal DOM helpers (no framework needed for a handful of screens). */
type Child = Node | string | null | undefined | false;
type Props = Partial<Omit<HTMLElement, 'style' | 'children'>> & { class?: string; style?: string; [k: string]: unknown };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k in el) (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, String(v));
  }
  for (const kid of kids) if (kid) el.append(kid);
  return el;
}

export function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  return h('button', { class: `btn ${cls}`.trim(), type: 'button', onclick: onClick }, label);
}

export const fmt = (n: number): string => n.toLocaleString('en-IN');

export function spriteImg(canvas: HTMLCanvasElement, scale = 2, cls = 'px'): HTMLImageElement {
  const img = new Image();
  img.src = canvas.toDataURL();
  img.className = cls;
  img.width = canvas.width * scale;
  img.height = canvas.height * scale;
  img.alt = '';
  return img;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}
