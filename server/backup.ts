/**
 * Backup and restore of every game key in Redis (accounts, nicknames, leaderboards, reminder
 * subscriptions, today's attempt locks). Rate-limit counters are skipped. Backups can be encrypted
 * with a passphrase (scrypt + AES-256-GCM), which matters because CI artifacts of a public repository
 * are not private.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import type { Cmd, UpstashRedis } from './redis';

type Value = string | Array<[string, string]> | Array<[string, number]> | string[];

export interface BackupEntry {
  key: string;
  type: 'string' | 'hash' | 'zset' | 'set' | 'list';
  /** Milliseconds left to live, or -1 for no expiry. */
  ttl: number;
  value: Value;
}

export interface Backup {
  format: 'messed-up-backup';
  version: 1;
  createdAt: string;
  keys: BackupEntry[];
}

const SKIP = /^mu:rl:/;
const BATCH = 50;

type Pipelined = Pick<UpstashRedis, 'cmd' | 'pipeline'>;

async function scanKeys(redis: Pipelined, pattern: string): Promise<string[]> {
  const keys = new Set<string>();
  let cursor = '0';
  do {
    const [next, batch] = (await redis.cmd<[string, string[]]>(['SCAN', cursor, 'MATCH', pattern, 'COUNT', 500])) ?? ['0', []];
    for (const k of batch ?? []) keys.add(String(k));
    cursor = String(next);
  } while (cursor !== '0');
  return [...keys].filter((k) => !SKIP.test(k)).sort();
}

const pairs = (flat: unknown[]): Array<[string, string]> => {
  const out: Array<[string, string]> = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([String(flat[i]), String(flat[i + 1])]);
  return out;
};

export async function exportAll(redis: Pipelined, now = new Date()): Promise<Backup> {
  const keys = await scanKeys(redis, 'mu:*');
  const entries: BackupEntry[] = [];
  for (let i = 0; i < keys.length; i += BATCH) {
    const chunk = keys.slice(i, i + BATCH);
    const meta = await redis.pipeline(chunk.flatMap((k): Cmd[] => [['TYPE', k], ['PTTL', k]]));
    const reads: Cmd[] = [];
    const kinds: Array<BackupEntry['type'] | null> = [];
    chunk.forEach((k, j) => {
      const type = String(meta[j * 2]);
      const read: Record<string, Cmd> = { string: ['GET', k], hash: ['HGETALL', k], zset: ['ZRANGE', k, 0, -1, 'WITHSCORES'], set: ['SMEMBERS', k], list: ['LRANGE', k, 0, -1] };
      kinds.push(read[type] ? (type as BackupEntry['type']) : null);
      if (read[type]) reads.push(read[type]!);
    });
    const values = reads.length ? await redis.pipeline(reads) : [];
    let v = 0;
    chunk.forEach((key, j) => {
      const type = kinds[j];
      if (!type) return; // vanished between SCAN and TYPE
      const raw = values[v++];
      const ttl = Number(meta[j * 2 + 1]);
      const value: Value = type === 'string' ? String(raw)
        : type === 'hash' ? pairs(raw as unknown[])
          : type === 'zset' ? pairs(raw as unknown[]).map(([m, s]): [string, number] => [m, Number(s)])
            : ((raw as unknown[]) ?? []).map(String);
      entries.push({ key, type, ttl: ttl > 0 ? ttl : -1, value });
    });
  }
  return { format: 'messed-up-backup', version: 1, createdAt: now.toISOString(), keys: entries };
}

/** Writes a backup back. Each key is replaced as a whole; keys that are not in the backup are left alone. */
export async function restoreAll(redis: Pipelined, backup: Backup): Promise<number> {
  if (backup.format !== 'messed-up-backup' || backup.version !== 1) throw new Error('Not a MESSED UP backup');
  const cmds: Cmd[] = [];
  for (const e of backup.keys) {
    cmds.push(['DEL', e.key]);
    if (e.type === 'string') cmds.push(['SET', e.key, e.value as string]);
    else if (e.type === 'hash' && e.value.length) cmds.push(['HSET', e.key, ...(e.value as Array<[string, string]>).flat()]);
    else if (e.type === 'zset' && e.value.length) cmds.push(['ZADD', e.key, ...(e.value as Array<[string, number]>).flatMap(([m, s]) => [s, m])]);
    else if (e.type === 'set' && e.value.length) cmds.push(['SADD', e.key, ...(e.value as string[])]);
    else if (e.type === 'list' && e.value.length) cmds.push(['RPUSH', e.key, ...(e.value as string[])]);
    if (e.ttl > 0) cmds.push(['PEXPIRE', e.key, e.ttl]);
  }
  for (let i = 0; i < cmds.length; i += 200) await redis.pipeline(cmds.slice(i, i + 200));
  return backup.keys.length;
}

const MAGIC = Buffer.from('MUBK1');

export function encryptBackup(json: string, passphrase: string): Buffer {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

export function decryptBackup(data: Buffer, passphrase: string): string {
  if (!data.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Not an encrypted MESSED UP backup');
  let o = MAGIC.length;
  const salt = data.subarray(o, (o += 16));
  const iv = data.subarray(o, (o += 12));
  const tag = data.subarray(o, (o += 16));
  const key = scryptSync(passphrase, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(data.subarray(o)), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Wrong passphrase, or the backup file is damaged');
  }
}
