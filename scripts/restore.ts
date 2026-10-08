/**
 * Restores a backup made by `npm run backup` into the live database (`npm run restore -- <file> --yes`).
 * Encrypted (.enc) files need BACKUP_PASSPHRASE. Every key in the backup is replaced; keys created after
 * the backup are left alone. Without --yes it only prints what it would do.
 */
import { readFileSync } from 'node:fs';
import { decryptBackup, restoreAll, type Backup } from '../server/backup';
import { liveRedis } from './liveRedis';

const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!file) {
  console.error('usage: npm run restore -- <backup file> [--yes]');
  process.exit(1);
}
const raw = readFileSync(file);
const text = file.endsWith('.enc') ? decryptBackup(raw, process.env.BACKUP_PASSPHRASE ?? '') : raw.toString('utf8');
const backup = JSON.parse(text) as Backup;
const players = backup.keys.filter((k) => k.key.startsWith('mu:u:')).length;
console.log(`Backup from ${backup.createdAt}: ${backup.keys.length} keys, ${players} players.`);
if (!process.argv.includes('--yes')) {
  console.log('Dry run. Add --yes to write these keys to the live database.');
  process.exit(0);
}
const n = await restoreAll(liveRedis(), backup);
console.log(`Restored ${n} keys.`);
