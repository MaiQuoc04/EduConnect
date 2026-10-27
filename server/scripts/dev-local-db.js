// DEVELOPMENT ONLY – throw-away local PostgreSQL for testing endpoints that WRITE data (UC-10, UC-11…), so tests
// never touch the shared Supabase database. No Docker and no PostgreSQL install needed.
//
// Setup (once; --no-save keeps package.json unchanged, run it again after a plain `npm install`):
//   npm install --no-save embedded-postgres@17.2.0-beta.15
// Start (from server/; keeps running until Ctrl+C, then stops and deletes the database):
//   node scripts/dev-local-db.js            schema v0.3 + small seed + the extra test classes below
//   node scripts/dev-local-db.js --bare     schema v0.3 + small seed only
// Point a server at it WITHOUT editing .env (dotenv never overrides variables already set), e.g. in Git Bash:
//   DB_HOST=127.0.0.1 DB_PORT=55432 DB_USER=postgres DB_PASSWORD=localtest DB_NAME=educonnect DB_SSL=false \
//   PORT=5099 node src/server.js
//
// This script never reads .env: it can only ever write to its own temporary instance.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const PORT = 55432;
const PASSWORD = 'localtest';
const DATABASE = 'educonnect';
const repoDatabaseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../database');
const dataDir = path.join(os.tmpdir(), `educonnect-dev-pg-${process.pid}`);

let EmbeddedPostgres;
try {
  ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
} catch {
  console.error('embedded-postgres is not installed. Run: npm install --no-save embedded-postgres@17.2.0-beta.15');
  process.exit(1);
}

// Extra rows for transfer / promotion tests, on top of the small seed (2026-2027: 10A1 and 11D1 with groups).
// - 2026-2027: 10A2 (with its 3 class groups, no members), 10A3 (no groups at all), 11A1 (only a GENERAL group),
//   10A9 (soft-deleted).
// - 2027-2028: next school year with 11A1 (no groups), for "different school year" checks and UC-11.
// - UC-11 extras: see the comments inside the SQL below.
const FIXTURES = `
BEGIN;
INSERT INTO school_years (year_name, start_date, end_date) VALUES ('2027-2028', '2027-09-05', '2028-05-31');
INSERT INTO classes (class_name, grade_level_id, school_year_id, track_id, deleted_at)
SELECT v.class_name, gl.grade_level_id, sy.school_year_id, c.track_id, v.deleted_at::timestamptz
FROM (VALUES ('10A2', '10', '2026-2027', NULL), ('10A3', '10', '2026-2027', NULL),
             ('11A1', '11', '2026-2027', NULL), ('10A9', '10', '2026-2027', '2026-10-01 08:00+07'),
             ('11A1', '11', '2027-2028', NULL)) AS v(class_name, grade, year_name, deleted_at)
JOIN grade_levels gl ON gl.grade_level_name = v.grade
JOIN school_years sy ON sy.year_name = v.year_name
JOIN classes c ON c.class_name = '10A1';
INSERT INTO groups (class_id, group_name, group_type, created_by)
SELECT c.class_id, v.group_name, v.group_type, (SELECT user_id FROM users WHERE username = 'binhnv')
FROM (VALUES ('10A2', '10A2', 'GENERAL'), ('10A2', '10A2 – Học sinh', 'STUDENT'), ('10A2', '10A2 – Phụ huynh', 'PARENT'),
             ('11A1', '11A1', 'GENERAL')) AS v(class_name, group_name, group_type)
JOIN classes c ON c.class_name = v.class_name
JOIN school_years sy ON sy.school_year_id = c.school_year_id AND sy.year_name = '2026-2027';

-- UC-11: more classes of 2027-2028 – 11D1 (3 groups), 10A1 (only GENERAL, for a student repeating grade 10),
-- 11A8 (soft-deleted); 11A1 above has no groups.
INSERT INTO classes (class_name, grade_level_id, school_year_id, track_id, deleted_at)
SELECT v.class_name, gl.grade_level_id, sy.school_year_id, t.track_id, v.deleted_at::timestamptz
FROM (VALUES ('11D1', '11', 'Khối D', NULL), ('10A1', '10', 'Khối A', NULL),
             ('11A8', '11', 'Khối A', '2026-10-01 08:00+07')) AS v(class_name, grade, track, deleted_at)
JOIN grade_levels gl ON gl.grade_level_name = v.grade
JOIN class_tracks t ON t.track_name = v.track
JOIN school_years sy ON sy.year_name = '2027-2028';
INSERT INTO groups (class_id, group_name, group_type, created_by)
SELECT c.class_id, v.group_name, v.group_type, (SELECT user_id FROM users WHERE username = 'binhnv')
FROM (VALUES ('11D1', '11D1', 'GENERAL'), ('11D1', '11D1 – Học sinh', 'STUDENT'), ('11D1', '11D1 – Phụ huynh', 'PARENT'),
             ('10A1', '10A1', 'GENERAL')) AS v(class_name, group_name, group_type)
JOIN classes c ON c.class_name = v.class_name
JOIN school_years sy ON sy.school_year_id = c.school_year_id AND sy.year_name = '2027-2028';

-- UC-11: more students of 2026-2027 (password Educonnect@2026, same hash as the seed). HS260003..HS260012 study in
-- 10A1; HS260013 DROPPED out of 10A1; HS260014 transferred 10A1 -> 10A2 (TRANSFERRED + STUDYING); HS260015 has
-- only a TRANSFERRED row (left 10A1, no new class).
INSERT INTO users (username, password_hash, full_name, status, must_change_password)
SELECT 'hs' || n, (SELECT password_hash FROM users WHERE username = 'baopg'), 'Học Sinh Thử ' || n, 'ACTIVE', FALSE
FROM generate_series(3, 15) AS n;
INSERT INTO user_roles (user_id, role_id)
SELECT u.user_id, r.role_id FROM users u JOIN roles r ON r.role_code = 'STUDENT' WHERE u.username LIKE 'hs%';
INSERT INTO students (user_id, student_code, dob, gender)
SELECT u.user_id, 'HS2600' || lpad(substr(u.username, 3), 2, '0'), '2011-05-01', 'FEMALE'
FROM users u WHERE u.username LIKE 'hs%';
INSERT INTO class_enrollments (student_id, class_id, status, enrolled_at, left_at)
SELECT s.student_id, c.class_id, v.status, v.enrolled_at::timestamptz, v.left_at::timestamptz
FROM (SELECT 'HS2600' || lpad(n::text, 2, '0'), '10A1', 'STUDYING', '2026-09-05 07:00', NULL
      FROM generate_series(3, 12) AS n
      UNION ALL VALUES ('HS260013', '10A1', 'DROPPED', '2026-09-05 07:00', '2026-10-10 08:00'),
                       ('HS260014', '10A1', 'TRANSFERRED', '2026-09-05 07:00', '2026-10-12 08:00'),
                       ('HS260014', '10A2', 'STUDYING', '2026-10-12 08:00', NULL),
                       ('HS260015', '10A1', 'TRANSFERRED', '2026-09-05 07:00', '2026-10-12 08:00'))
     AS v(student_code, class_name, status, enrolled_at, left_at)
JOIN students s ON s.student_code = v.student_code
JOIN classes c ON c.class_name = v.class_name
JOIN school_years sy ON sy.school_year_id = c.school_year_id AND sy.year_name = '2026-2027';
COMMIT;`;

const epg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: PASSWORD,
  port: PORT,
  persistent: false, // the data folder is deleted on stop
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  postgresFlags: ['-c', 'timezone=Asia/Ho_Chi_Minh'],
});

async function stop() {
  console.log('Stopping and deleting the local database…');
  await epg.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exit(0);
}

await epg.initialise();
await epg.start();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
await epg.createDatabase(DATABASE);

const client = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', password: PASSWORD, database: DATABASE });
await client.connect();
await client.query(fs.readFileSync(path.join(repoDatabaseDir, 'educonnect_schema_v0.3.sql'), 'utf8'));
await client.query(fs.readFileSync(path.join(repoDatabaseDir, 'educonnect_seed_small_v0.3.sql'), 'utf8'));
if (!process.argv.includes('--bare')) await client.query(FIXTURES);
const { rows } = await client.query(
  `SELECT c.class_id AS id, c.class_name AS name, sy.year_name AS year, c.deleted_at IS NOT NULL AS deleted,
          (SELECT COUNT(*) FROM groups g WHERE g.class_id = c.class_id) AS groups
   FROM classes c JOIN school_years sy ON sy.school_year_id = c.school_year_id ORDER BY c.class_id`,
);
await client.end();
console.table(rows);
console.log(`READY: local PostgreSQL on 127.0.0.1:${PORT}, database ${DATABASE} (data in ${dataDir}). Ctrl+C to stop.`);
setInterval(() => {}, 1 << 30);
