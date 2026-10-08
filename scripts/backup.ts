/**
 * Exports every account, nickname, leaderboard and reminder subscription to backups/ (`npm run backup`).
 * With BACKUP_PASSPHRASE set, the file is encrypted (.enc); otherwise it is plain JSON.
 * The weekly GitHub Action (.github/workflows/backup.yml) runs this with the passphrase set.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { encryptBackup, exportAll } from '../server/backup';
import { liveRedis } from './liveRedis';

const redis = liveRedis();
const backup = await exportAll(redis);
const json = JSON.stringify(backup);
const passphrase = process.env.BACKUP_PASSPHRASE;
const stamp = backup.createdAt.slice(0, 19).replace(/[:T]/g, '-');
mkdirSync('backups', { recursive: true });
const file = passphrase ? `backups/messed-up-${stamp}.json.enc` : `backups/messed-up-${stamp}.json`;
writeFileSync(file, passphrase ? encryptBackup(json, passphrase) : json);
const players = backup.keys.filter((k) => k.key.startsWith('mu:u:')).length;
console.log(`Backed up ${backup.keys.length} keys (${players} players) to ${file}${passphrase ? ' (encrypted)' : ''}`);
