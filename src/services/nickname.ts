/** Nickname rules shared by the client (instant feedback) and the server (the real check). */
export const NICK_MIN = 3;
export const NICK_MAX = 14;
export const NICK_RE = /^[A-Za-z0-9_-]{3,14}$/;

export function nicknameProblem(name: string): string | null {
  if (name.length < NICK_MIN || name.length > NICK_MAX) return `Use ${NICK_MIN}-${NICK_MAX} characters.`;
  if (!NICK_RE.test(name)) return 'Letters, numbers, _ and - only.';
  return null;
}

const ADJ = ['Spicy', 'Sleepy', 'Soggy', 'Crispy', 'Hungry', 'Salty', 'Saucy', 'Lazy', 'Cranky', 'Sneaky', 'Tangy', 'Grumpy', 'Zesty', 'Mighty', 'Fluffy', 'Hasty', 'Jolly', 'Rusty', 'Toasty', 'Sly'];
const NOUN = ['Idli', 'Dosa', 'Egg', 'Rasam', 'Chai', 'Puff', 'Rice', 'Banana', 'Curd', 'Vada', 'Poha', 'Pongal', 'Sambar', 'Lassi', 'Kurma', 'Upma', 'Bonda', 'Halwa', 'Kesari', 'Pulao'];

/** About 360,000 combinations; the server still checks each one is free before handing it out. */
export function randomNickname(rand: () => number = Math.random): string {
  const r = (n: number) => Math.floor(rand() * n);
  return `${ADJ[r(ADJ.length)]}${NOUN[r(NOUN.length)]}${100 + r(900)}`.slice(0, NICK_MAX);
}
