/** Tunable constants and per-weekday theming. Keep magic numbers here. */
export const TILE = 16;
export const COLS = 19;
export const ROWS = 21;
export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;

export const PLAYER_SPEED = 5.8; // tiles per second
export const START_STOMACHS = 3;
export const MAX_STOMACHS = 5;
export const COURSES = ['Breakfast', 'Lunch', 'Dinner'] as const;
export const COURSE_COUNT = COURSES.length;

export const POINTS = {
  food: 10,
  snack: 100,
  enemyBase: 200,
  stageClear: 500,
  perStomach: 100,
  perSecondUnderPar: 5,
} as const;

export const COMBO_WINDOW = 2.2; // seconds
export const HUNGER_REFILL = 0.045;
export const INVULN_SECONDS = 2.2;
export const MAGGI_SECONDS = 7;
export const WARDEN_WARN_AT = 9; // seconds without eating
export const WARDEN_SPAWN_AT = 13;
export const SNACK_LIFETIME = 12;

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export interface DayTheme {
  weekday: number;
  name: string;
  title: string; // funny level name
  /** Two floorboard tones (a third is mixed from them). */
  floorA: string;
  floorB: string;
  /** Table / counter top and its front edge. */
  wallTop: string;
  wallSide: string;
  /** Table runner cloth. */
  cloth: string;
  /** Wallpaper base and pattern. */
  paper: string;
  paper2: string;
  /** Accent used by the UI. */
  accent: string;
}

/** The mess hall changes its dress every day: floor stain, tablecloths and wallpaper. */
export const THEMES: readonly DayTheme[] = [
  { weekday: 0, name: 'Sunday', title: 'Leftovers of the Week', floorA: '#6e5a48', floorB: '#64513f', wallTop: '#dccfae', wallSide: '#8a7656', cloth: '#9aa0a6', paper: '#4f5560', paper2: '#5f6672', accent: '#f4ecd8' },
  { weekday: 1, name: 'Monday', title: 'Fresh Hope', floorA: '#8a5a30', floorB: '#7f522b', wallTop: '#ecbd6e', wallSide: '#a9702f', cloth: '#c8452f', paper: '#2f5d6a', paper2: '#3c7280', accent: '#ffc857' },
  { weekday: 2, name: 'Tuesday', title: 'Rice Again', floorA: '#7b5535', floorB: '#704b2e', wallTop: '#e3c68c', wallSide: '#9a7a45', cloth: '#2a9d8f', paper: '#5b2a3a', paper2: '#703649', accent: '#7fe3c8' },
  { weekday: 3, name: 'Wednesday', title: 'The Special', floorA: '#6d4a3f', floorB: '#634238', wallTop: '#e0bfa8', wallSide: '#8f6a58', cloth: '#7b4fc9', paper: '#3d2a5c', paper2: '#4d3772', accent: '#c4a3ff' },
  { weekday: 4, name: 'Thursday', title: 'Almost There', floorA: '#6f6030', floorB: '#655729', wallTop: '#dfd391', wallSide: '#8f8a4a', cloth: '#52b788', paper: '#2f4a2c', paper2: '#3b5d38', accent: '#b3f08a' },
  { weekday: 5, name: 'Friday', title: 'Biryani Hour', floorA: '#7a4630', floorB: '#6e3f2b', wallTop: '#f2b48e', wallSide: '#a85a3a', cloth: '#e63946', paper: '#6b2a2a', paper2: '#823838', accent: '#ff9d9d' },
  { weekday: 6, name: 'Saturday', title: 'Weekend Mess', floorA: '#5d5a63', floorB: '#555259', wallTop: '#c3d4ea', wallSide: '#6f88a8', cloth: '#3a86ff', paper: '#2b3f5e', paper2: '#38506f', accent: '#9ccaff' },
];

/** Monday = tier 0 (easiest) ... Sunday = tier 6 (hardest). */
export function tierOf(weekday: number): number {
  return (weekday + 6) % 7;
}
