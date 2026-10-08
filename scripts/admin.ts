/**
 * Moderation tool for the live leaderboard. Needs the Upstash credentials: run `npx vercel env pull .env.local --environment=production`
 * once (writes .env.local, which is git-ignored), then:
 *
 *   npm run admin -- top daily|alltime|streak     show the top 20 with account IDs
 *   npm run admin -- find <nickname>              show one player's record
 *   npm run admin -- rename <nickname> <new>      force a new nickname (e.g. an offensive one)
 *   npm run admin -- ban <nickname>               remove from every board and block ranked play
 *   npm run admin -- unban <nickname>
 */
import { addDays } from '../src/core/clock';
import { serverDate } from '../server/daily';
import { getUser, K, renameUser } from '../server/store';
import { liveRedis } from './liveRedis';

const redis = liveRedis();
const [cmd, a, b] = process.argv.slice(2);

async function subOf(name: string | undefined): Promise<string> {
  const sub = name ? await redis.cmd<string | null>(['HGET', K.names, name.toLowerCase()]) : null;
  if (!sub) throw new Error(`No player called "${name}"`);
  return sub;
}

async function main(): Promise<void> {
  const today = serverDate(Date.now());
  if (cmd === 'top') {
    const key = a === 'alltime' ? K.alltime : a === 'streak' ? K.streak : K.daily(today);
    const flat = (await redis.cmd<string[]>(['ZRANGE', key, 0, 19, 'REV', 'WITHSCORES'])) ?? [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      const name = await redis.cmd<string | null>(['HGET', K.nick, flat[i]!]);
      console.log(`${String(i / 2 + 1).padStart(2)}. ${String(name).padEnd(15)} ${flat[i + 1]!.padStart(7)}  ${flat[i]}`);
    }
  } else if (cmd === 'find') {
    console.log(JSON.stringify(await getUser(redis, await subOf(a)), null, 2));
  } else if (cmd === 'rename') {
    const user = await getUser(redis, await subOf(a));
    if (!user || !b) throw new Error('usage: rename <nickname> <new>');
    await renameUser(redis, user, b);
    console.log(`Renamed ${a} -> ${b}`);
  } else if (cmd === 'ban' || cmd === 'unban') {
    const sub = await subOf(a);
    if (cmd === 'ban') {
      const yesterday = addDays(today, -1);
      await redis.multi([
        ['HSET', K.user(sub), 'banned', '1'],
        ['ZREM', K.daily(today), sub],
        ['ZREM', K.daily(yesterday), sub],
        ['ZREM', K.alltime, sub],
        ['ZREM', K.streak, sub],
      ]);
    } else await redis.cmd(['HDEL', K.user(sub), 'banned']);
    console.log(`${cmd === 'ban' ? 'Banned' : 'Unbanned'} ${a}`);
  } else {
    console.log('Commands: top daily|alltime|streak, find <name>, rename <name> <new>, ban <name>, unban <name>');
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
