/**
 * Nickname moderation: a small blocklist checked after undoing common disguises
 * (case, leetspeak digits, separators, repeated letters). It stops casual abuse; anything that slips
 * through can be renamed with `npm run admin`.
 */

/** Blocked anywhere in the name. */
const ANYWHERE = [
  'fuck', 'shit', 'bitch', 'cunt', 'pussy', 'whore', 'slut', 'bastard', 'asshole', 'nigger', 'nigga', 'faggot', 'retard',
  'nazi', 'hitler', 'porn', 'penis', 'vagina',
  'chutiya', 'chutia', 'madarchod', 'bhenchod', 'behenchod', 'bhosdi', 'bsdk', 'gandu', 'randi', 'harami', 'kamina',
  'lavda', 'punda', 'thevdiya', 'thevidiya', 'baadu', 'lanja',
];
/** Short words that hide inside innocent ones ("grapes", "peacock"), so only blocked at the start of a name. */
const AT_START = ['rape', 'cum', 'tits', 'boob', 'dick', 'cock', 'lund', 'loda', 'otha', 'kuta', 'sex'];
const RESERVED = ['admin', 'administrator', 'moderator', 'system', 'messedup', 'official', 'support', 'warden'];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', $: 's', '@': 'a' };

export function normalizeForModeration(name: string): string {
  return name
    .toLowerCase()
    .replace(/[0-9$@]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z]/g, '')
    .replace(/(.)\1+/g, '$1');
}

const squash = (w: string): string => w.replace(/(.)\1+/g, '$1');

export function isNicknameAllowed(name: string): boolean {
  const n = normalizeForModeration(name);
  if (RESERVED.some((r) => n === squash(r))) return false;
  if (ANYWHERE.some((w) => n.includes(squash(w)))) return false;
  return !AT_START.some((w) => n.startsWith(squash(w)));
}
