// npm run db:check – verifies the .env settings reach the database and lists the tables.
import { pool } from '../src/config/db.js';

try {
  const [[info]] = await pool.query('SELECT VERSION() AS version, DATABASE() AS db');
  const [tables] = await pool.query(
    'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE()',
  );
  console.log(`Connected: MySQL ${info.version}, database "${info.db}", ${tables[0].n} tables (expected 46).`);
} catch (err) {
  console.error('Cannot connect to the database:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
