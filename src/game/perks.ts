/** Between-stage upgrades ("roguelite" layer that makes each run feel different). */
import { shuffle, type Rng } from '../core/rng';

export interface RunModifiers {
  speedMul: number;
  maggiBonus: number;
  comboBonus: number;
  showPaths: boolean;
  extraStomachs: number;
}

export const freshModifiers = (): RunModifiers => ({ speedMul: 1, maggiBonus: 0, comboBonus: 0, showPaths: false, extraStomachs: 0 });

export interface Perk {
  id: string;
  name: string;
  desc: string;
  apply(m: RunModifiers): void;
}

export const PERKS: readonly Perk[] = [
  { id: 'chew', name: 'Fast Chewing', desc: '+8% move speed', apply: (m) => void (m.speedMul *= 1.08) },
  { id: 'stomach', name: 'Extra Stomach', desc: '+1 stomach (life)', apply: (m) => void (m.extraStomachs += 1) },
  { id: 'maggi', name: 'Iron Stomach', desc: 'Maggi lasts +3 seconds', apply: (m) => void (m.maggiBonus += 3) },
  { id: 'spoon', name: 'Lucky Spoon', desc: 'Combo window +1 second', apply: (m) => void (m.comboBonus += 1) },
  { id: 'hack', name: 'Hostel Hack', desc: 'See enemy paths', apply: (m) => void (m.showPaths = true) },
];

export function offerPerks(rng: Rng, owned: ReadonlySet<string>): Perk[] {
  const pool = PERKS.filter((p) => !owned.has(p.id) || p.id === 'stomach' || p.id === 'chew');
  return shuffle([...pool], rng).slice(0, 3);
}
