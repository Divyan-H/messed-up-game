/** A trimmed-down version of the SRM hostel mess menu (index = weekday, 0 = Sunday). */
export const FOOD_KINDS = [
  'idli', 'egg', 'banana', 'poha', 'pongal', 'kichadi', 'rice', 'pulao', 'friedrice', 'biryani', 'curdrice',
  'rasam', 'rasamPepper', 'rasamGarlic', 'buttermilk', 'milk', 'poriyal', 'dal', 'kootu', 'chips', 'mutter',
  'chenna', 'fruit', 'icecream', 'corn', 'pavbhaji', 'sundal', 'puff', 'biscuit', 'bun', 'cake',
] as const;

/** Each kind is a distinct dish with its own sprite (see render/foodArt.ts). */
export type FoodKind = (typeof FOOD_KINDS)[number];

export interface MenuItem {
  kind: FoodKind;
  name: string;
}

export interface DayMenu {
  breakfast: MenuItem[];
  lunch: MenuItem[];
  dinner: MenuItem[];
  snack: MenuItem;
}

const I = (kind: FoodKind, name: string): MenuItem => ({ kind, name });
const egg = I('egg', 'Boiled Egg');
const banana = I('banana', 'Banana');
const fruit = I('fruit', 'Special Fruit');
const milk = I('milk', 'Milk');
const buttermilk = I('buttermilk', 'Butter Milk');

export const MENUS: readonly DayMenu[] = [
  { // Sunday
    breakfast: [I('idli', 'Idli'), egg, banana],
    lunch: [I('rice', 'White Rice'), I('rasam', 'Tomato Rasam'), buttermilk],
    dinner: [fruit, milk, I('icecream', 'Ice Cream')],
    snack: I('corn', 'Sweet Corn'),
  },
  { // Monday
    breakfast: [I('poha', 'Poha'), egg, banana],
    lunch: [I('pulao', 'Variety Rice'), I('rasamPepper', 'Pepper Rasam'), buttermilk],
    dinner: [I('mutter', 'Aloo Mutter'), fruit, milk],
    snack: I('pavbhaji', 'Pav Bhaji'),
  },
  { // Tuesday
    breakfast: [I('pongal', 'Pongal'), egg, banana],
    lunch: [I('pulao', 'Jeera Pulao'), I('rasamGarlic', 'Garlic Rasam'), buttermilk],
    dinner: [I('friedrice', 'Fried Rice'), fruit, milk],
    snack: I('sundal', 'Sundal'),
  },
  { // Wednesday
    breakfast: [I('idli', 'Idli'), egg, banana],
    lunch: [I('pulao', 'Veg Pulao'), I('poriyal', 'Potato Poriyal'), buttermilk],
    dinner: [I('dal', 'Yellow Dal'), fruit, milk],
    snack: I('puff', 'Veg Puff'),
  },
  { // Thursday
    breakfast: [I('kichadi', 'Semiya Kichadi'), egg, banana],
    lunch: [I('pulao', 'Bagara Pulao'), I('dal', 'Mysore Dal'), buttermilk],
    dinner: [I('chenna', 'Chenna Masala'), I('icecream', 'Ice Cream'), milk],
    snack: I('biscuit', 'Biscuit'),
  },
  { // Friday
    breakfast: [I('pongal', 'Pongal'), egg, banana],
    lunch: [I('biryani', 'Veg Biryani'), I('curdrice', 'Curd Rice'), I('chips', 'Potato Chips')],
    dinner: [I('dal', 'Veg Dal'), fruit, milk],
    snack: I('bun', 'Sweet Bun'),
  },
  { // Saturday
    breakfast: [I('kichadi', 'Semiya Kichadi'), egg, banana],
    lunch: [I('pulao', 'Corn Pulao'), I('kootu', 'Kootu'), buttermilk],
    dinner: [I('dal', 'Veg Dal'), fruit, milk],
    snack: I('cake', 'Cake'),
  },
];

export function mealItems(menu: DayMenu, course: number): MenuItem[] {
  return course === 0 ? menu.breakfast : course === 1 ? menu.lunch : menu.dinner;
}

/** Distinct dishes by name (a course can list the same dish twice across days, never within a course). */
export function uniqueItems(items: readonly MenuItem[]): MenuItem[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.name) ? false : (seen.add(i.name), true)));
}
