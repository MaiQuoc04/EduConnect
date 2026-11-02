// npm run db:check – verifies the .env settings reach the database and lists the tables.
import { pool } from '../src/config/db.js';

try {
  const { rows: [info] } = await pool.query("SELECT current_setting('server_version') AS version, current_database() AS db, current_setting('TimeZone') AS tz");
  const { rows: [tables] } = await pool.query(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
  );
  console.log(`Connected: PostgreSQL ${info.version}, database "${info.db}", ${tables.n} tables (expected 47), time zone ${info.tz} (expected Asia/Ho_Chi_Minh).`);
} catch (err) {
  console.error('Cannot connect to the database:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
