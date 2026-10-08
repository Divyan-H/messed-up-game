import { describe, expect, it } from 'vitest';
import { decryptBackup, encryptBackup, exportAll, restoreAll } from '../server/backup';
import { FakeUpstash } from '../server/dev/fakeUpstash';
import { UpstashRedis } from '../server/redis';
import { createUser, getUser, K, renameUser } from '../server/store';

const NOW = Date.UTC(2026, 9, 7, 6);

async function seeded() {
  const fake = new FakeUpstash(() => NOW);
  const redis = new UpstashRedis('https://redis.test', 't', fake.fetch);
  const ana = await createUser(redis, 'g-ana', NOW);
  await renameUser(redis, ana, 'Ana');
  await createUser(redis, 'g-bob', NOW);
  await redis.multi([
    ['ZADD', K.daily('2026-10-07'), 420, 'g-ana', 380, 'g-bob'],
    ['EXPIRE', K.daily('2026-10-07'), 8 * 86_400],
    ['ZADD', K.alltime, 420, 'g-ana'],
    ['SET', K.lock('2026-10-07', 'g-ana'), 'att1', 'EX', 3 * 86_400],
    ['SADD', K.pushers, 'g-ana'],
    ['LPUSH', K.errors, '{"msg":"x"}'],
    ['INCR', K.rate('auth', '1.2.3.4')],
  ]);
  return { fake, redis };
}

describe('backups', () => {
  it('exports every game key with its type and expiry, skipping rate-limit counters', async () => {
    const { redis } = await seeded();
    const b = await exportAll(redis, new Date(NOW));
    const byKey = new Map(b.keys.map((e) => [e.key, e]));
    expect(byKey.get(K.user('g-ana'))?.type).toBe('hash');
    expect(byKey.get(K.daily('2026-10-07'))).toMatchObject({ type: 'zset', value: [['g-bob', 380], ['g-ana', 420]] });
    expect(byKey.get(K.daily('2026-10-07'))!.ttl).toBeGreaterThan(7 * 86_400_000);
    expect(byKey.get(K.pushers)).toMatchObject({ type: 'set', value: ['g-ana'] });
    expect(byKey.get(K.errors)).toMatchObject({ type: 'list' });
    expect(byKey.get(K.lock('2026-10-07', 'g-ana'))).toMatchObject({ type: 'string', value: 'att1' });
    expect([...byKey.keys()].some((k) => k.startsWith('mu:rl:'))).toBe(false);
  });

  it('restores into an empty database exactly as it was', async () => {
    const { redis } = await seeded();
    const backup = await exportAll(redis, new Date(NOW));
    const empty = new UpstashRedis('https://redis.test', 't', new FakeUpstash(() => NOW).fetch);
    expect(await restoreAll(empty, backup)).toBe(backup.keys.length);
    expect((await getUser(empty, 'g-ana'))?.name).toBe('Ana');
    expect(await empty.cmd(['HGET', K.names, 'ana'])).toBe('g-ana');
    expect(await empty.cmd(['ZRANGE', K.daily('2026-10-07'), 0, -1, 'REV', 'WITHSCORES'])).toEqual(['g-ana', '420', 'g-bob', '380']);
    expect(Number(await empty.cmd(['PTTL', K.daily('2026-10-07')]))).toBeGreaterThan(7 * 86_400_000);
    expect(await exportAll(empty, new Date(NOW))).toEqual(backup);
  });

  it('encrypts backups so a public CI artifact reveals nothing without the passphrase', async () => {
    const { redis } = await seeded();
    const json = JSON.stringify(await exportAll(redis, new Date(NOW)));
    const enc = encryptBackup(json, 'correct horse battery staple');
    expect(enc.includes(Buffer.from('g-ana'))).toBe(false);
    expect(decryptBackup(enc, 'correct horse battery staple')).toBe(json);
    expect(() => decryptBackup(enc, 'wrong')).toThrow(/passphrase/);
  });
});
