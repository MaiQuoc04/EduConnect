// Removes orphan uploads: files signed and uploaded into tmp/<userId>/ of the attachments bucket but never confirmed
// (the user closed the tab, the upload failed half way…). They are invisible to everyone but take Storage quota.
// Run BY HAND from server/, e.g. once a week (no cron on purpose):
//   node scripts/clean-orphan-uploads.js                 list what would be deleted (dry run, the default)
//   node scripts/clean-orphan-uploads.js --delete        delete them
//   --min-age-hours <n>   only files older than n hours (default 24: an upload URL lives 2 hours, so a file younger
//                         than that may still be confirmed – a smaller value prints a warning)
// Uses the storage settings of .env (STORAGE_DRIVER, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY): with supabase it
// cleans the real bucket, with local the tmp/ folder under UPLOAD_DIR. Never prints the key.
import { env } from '../src/config/env.js';
import { deleteFile, listFolder } from '../src/utils/storage.js';

const args = process.argv.slice(2);
const doDelete = args.includes('--delete');
const ageIndex = args.indexOf('--min-age-hours');
const minAgeHours = ageIndex >= 0 ? Number(args[ageIndex + 1]) : 24;
if (!Number.isFinite(minAgeHours) || minAgeHours < 0) {
  console.error('--min-age-hours needs a number >= 0');
  process.exit(1);
}
if (minAgeHours < 2) console.warn(`WARNING: --min-age-hours ${minAgeHours} is below the 2-hour life of an upload URL: an upload in progress may be deleted.`);

const bucket = env.storage.buckets.attachments;
// Ages are measured with the STORAGE's clock (created_at is set by Supabase), not this machine's, which may be off.
let now = Date.now();
if (env.storage.driver === 'supabase') {
  const res = await fetch(`${env.storage.supabaseUrl}/storage/v1/version`).catch(() => null); // public, no key sent
  const remote = Date.parse(res?.headers.get('date') ?? '');
  if (Number.isFinite(remote)) now = remote;
}
const cutoff = now - minAgeHours * 3600 * 1000;
console.log(`Driver: ${env.storage.driver}, bucket: ${bucket}, tmp/ files older than ${minAgeHours} h (before ${new Date(cutoff).toISOString()})`);

const orphans = [];
for (const userFolder of (await listFolder(bucket, 'tmp')).filter((e) => e.isFolder)) {
  for (const file of await listFolder(bucket, userFolder.key)) {
    if (file.isFolder) continue; // tmp/<userId>/ holds files only; anything deeper was not made by /uploads/sign
    const created = Date.parse(file.createdAt ?? '');
    if (Number.isFinite(created) && created < cutoff) orphans.push({ ...file, created });
  }
}

const totalBytes = orphans.reduce((sum, f) => sum + (Number(f.size) || 0), 0);
for (const f of orphans) console.log(`  ${f.key}  ${f.size ?? '?'} B  ${new Date(f.created).toISOString()}`);
console.log(`${orphans.length} orphan file(s), ${(totalBytes / 1024 / 1024).toFixed(2)} MB.`);

if (!doDelete) {
  console.log('Dry run: nothing deleted. Run again with --delete to delete them.');
  process.exit(0);
}
let deleted = 0;
for (const f of orphans) {
  try {
    await deleteFile(bucket, f.key);
    deleted += 1;
  } catch (err) {
    console.error(`  could not delete ${f.key}: ${err.message}`);
  }
}
console.log(`Deleted ${deleted} of ${orphans.length} file(s).`);
process.exit(deleted === orphans.length ? 0 : 1);
