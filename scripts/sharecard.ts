/** Renders an example share card to docs/screens/share-card.png (`npm run sharecard`). */
import { createCanvas, GlobalFonts, type Canvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setCanvasFactory } from '../src/render/canvas';
import { drawShareCard } from '../src/ui/shareCard';

GlobalFonts.registerFromPath('node_modules/@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2', 'Press Start 2P');
setCanvasFactory((w, h) => createCanvas(w, h) as unknown as HTMLCanvasElement);

const card = drawShareCard({
  mode: 'daily',
  weekday: 4,
  dateLabel: '8 OCT',
  score: 4380,
  levelLabel: 'HARD x1.2',
  cleared: [true, true, false],
  dishes: 31,
  streak: 7,
  rank: 3,
  site: 'messed-up-game.vercel.app',
}) as unknown as Canvas;
mkdirSync('docs/screens', { recursive: true });
writeFileSync('docs/screens/share-card.png', card.toBuffer('image/png'));
console.log('wrote docs/screens/share-card.png');
