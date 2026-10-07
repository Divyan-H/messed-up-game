/** Small props for the dining hall (tabletop clutter, wall lamp, plate under each dish). Drawn as text like all art. */
import type { SpriteDef } from './art';

export const DECOR_SPRITES: Record<string, SpriteDef> = {
  /** Dinner plate with a bite of something on it (tabletop). */
  tPlate: { rows: ['..wwww..', '.wqqqqw.', 'wqqoyqqw', 'wqqqqqqw', '.wqqqqw.', '..wwww..'] },
  tCup: { rows: ['.wwww..', 'wnnnnw.', 'wnnnnww', 'wnnnnw.', '.wwww..'] },
  tBottleR: { rows: ['.s.', '.s.', 'rrr', 'rwr', 'rrr', 'rur'] },
  tBottleG: { rows: ['.s.', '.s.', 'ggg', 'gxg', 'ggg', 'gvg'] },
  tNapkin: { rows: ['wwwwww', 'wsssww', 'wwwwww'] },
  tBowl: { rows: ['.wwwww.', 'wbbbbbw', 'wbcbbbw', '.wwwww.'] },
  tPlant: { rows: ['.g.gg.', 'gggvgg', '.gvgg.', '..nn..', '.nnnn.'] },
  /** Brass wall lamp with a glowing bulb. */
  lamp: { rows: ['...a...', '..aaa..', '.ahhha.', '.ahhha.', '..aaa..', '...n...'] },
  /** Oval plate seen from above; drawn under every dish so food looks served, not dropped. */
  plate: { rows: ['..wwwwwwww..', '.wwqqqqqqww.', 'wwqqqqqqqqww', '.sswwwwwwss.'] },
};
