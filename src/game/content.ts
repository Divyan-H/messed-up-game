/** All the jokes live here, so writers (you!) can edit funny notes without touching logic. */
import type { FoodKind } from './menu';
import type { EnemyKind } from './enemies';

export const QUIPS_BY_FOOD: Record<FoodKind, string[]> = {
  idli: ['Idli: soft, round, unbothered.', 'Idli: the only thing here with no plot.', 'Idli count: 1. Dignity: intact.'],
  egg: ['Egg: protein, allegedly.', 'Boiled egg: a hostel love language.', 'Egg secured. It looked back at you.'],
  banana: ["Banana: the safe choice.", "Banana: nature's wrapper.", 'Banana. Nobody has ever been served a bad one.'],
  poha: ['Poha: breakfast where the mess actually tried.', 'Poha: yellow, soft, suspiciously healthy.'],
  pongal: ['Pongal: a warm hug with a pepper in it.', 'Pongal: ghee level unknown, vibes immaculate.'],
  kichadi: ['Kichadi: noodles pretending to be breakfast.', 'Semiya: vermicelli with ambition.'],
  rice: ['Rice: the foundation of everything.', 'Rice again. We respect the loyalty.', 'Plate cleared. Seconds? No.'],
  pulao: ['Pulao: rice, but with a personality.', 'Pulao detected. One lonely pea spotted.'],
  friedrice: ['Fried rice: Chinese in spirit, hostel in flavour.', 'Fried rice: the only rice in a costume.'],
  biryani: ['Biryani: the Friday miracle.', 'Biryani! Even the warden smiled.'],
  curdrice: ["Curd rice: rice's lawyer has arrived.", 'Curd rice: a peace treaty in a bowl.'],
  rasam: ['Rasam: soup with a spice rack.', 'Rasam: cures everything except the hostel.'],
  rasamPepper: ['Pepper rasam: sinuses cleared, dignity optional.', 'Pepper rasam: it fights back.'],
  rasamGarlic: ['Garlic rasam: nobody is kissing you today.', 'Garlic rasam: tastes like a good decision.'],
  buttermilk: ['Butter milk: spicy water with a plot twist.', 'Butter milk: cooling system installed.'],
  milk: ['Milk: the colour of hope.', 'Milk: the strongest drink in the mess.'],
  poriyal: ['Poriyal: potatoes in their final form.', 'Potato poriyal: crunchy optimism.'],
  dal: ['Dal: yellow, thin, honest.', 'Dal: 90% water, 10% hope.'],
  kootu: ['Kootu: vegetables in witness protection.', 'Kootu: dal and veggies finally got along.'],
  chips: ['Chips: 3 chips, 97% air.', 'Crunch! The packet was mostly a rumour.'],
  mutter: ["Aloo Mutter: Mystery Curry's cousin.", 'Peas found. Mutter matters.'],
  chenna: ['Chenna masala: chickpeas with confidence.', 'Chenna: the protein hostel kids pretend to like.'],
  fruit: ['Special fruit: looks fresh, feels suspicious.', 'An apple a day keeps the warden away.'],
  icecream: ['Ice cream: the mess is finally trying.', 'Ice cream! Brain freeze beats exam stress.'],
  corn: ['Sweet corn: golden and slightly judgemental.', 'Corn: a kernel of truth.'],
  pavbhaji: ['Pav bhaji: the butter did most of the work.', 'Pav bhaji: Mumbai wants its pav back.'],
  sundal: ['Sundal: chickpeas at 5pm, tradition.', 'Sundal: evening snack, morning regret.'],
  puff: ['Puff: 40% air, 60% hope.', 'Crunch! Crumbs went everywhere. Just like your GPA.', 'Snack acquired. Do not tell the warden.'],
  biscuit: ['Biscuit: dunk or die.', 'One biscuit. Nobody saw anything.'],
  bun: ['Sweet bun: the hostel birthday cake.', 'Sweet bun: sugar with structure.'],
  cake: ['Cake! Someone passed an exam.', 'Cake: proof the mess has a heart.'],
};

export const DEATH_LINES = [
  'You were served.',
  'Cause of death: Tuesday.',
  'The rice won.',
  'Mess closed. Permanently.',
  'You have been marked absent from life.',
  'The sambar has opinions about you.',
  'Food poisoning (emotional).',
  'You\'ve been plated.',
];

export const WARDEN_BARKS = ['Plate wapas kar!', 'Mess timing is over, beta.', 'Idhar aao!', 'ID card dikhao!', 'Hostel rules padhe ho?'];
export const WARDEN_WARNINGS = ['The Warden smells idleness...', 'Keep eating. Warden is on his way.', 'Standing still is a crime here.'];

export const LOADING_TIPS = [
  'Tip: the egg is a lie.',
  'Fact: curd is just rice\'s lawyer.',
  'Tip: Maggi from outside is a cheat code.',
  'Fact: nobody has seen the Mystery Curry\'s recipe.',
  'Tip: eat fast. Combos love a hungry student.',
  'Fact: the Chapati Ghost has been here since 2019.',
  'Tip: dead ends are where dreams go to die.',
  'Fact: Wednesday Special is moody. Respect it.',
];

export const COMBO_CALLS = ['', '', 'CRUNCHY!', 'SECONDS PLEASE!', 'MESS KING!', 'UNSTOPPABLE!'];

export const ENEMY_INFO: Record<EnemyKind, { name: string; blurb: string }> = {
  blob: { name: 'Sambar Blob', blurb: 'Chases you with A* search. Relentless.' },
  curry: { name: 'Mystery Curry', blurb: 'Ambusher: aims where you are heading.' },
  chapati: { name: 'Chapati Ghost', blurb: 'Wanders randomly. Pure chaos.' },
  special: { name: 'Wednesday Special', blurb: 'Moody FSM: patrol, chase, lose interest.' },
  warden: { name: 'The Warden', blurb: 'Appears when you stop eating.' },
};

export const ACHIEVEMENTS = [
  { id: 'first', name: 'First Plate', desc: 'Finish your first run' },
  { id: 'immunity', name: 'Hostel Immunity', desc: 'Clear all 3 courses in a run' },
  { id: 'maggi', name: 'Maggi Maniac', desc: 'Eat 4 enemy dishes in one run' },
  { id: 'streak3', name: 'Mess Regular', desc: '3-day streak' },
  { id: 'streak7', name: 'Mess Committee', desc: '7-day streak' },
  { id: 'untouched', name: 'Iron Stomach', desc: 'Clear a run without losing a stomach' },
] as const;
