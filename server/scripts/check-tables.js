import { pool } from '../src/config/db.js';

const [tables] = await pool.query(
  `SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public' ORDER BY table_name`
);
console.log('Tables in public schema:');
tables.forEach(r => console.log(' -', r.table_name));
await pool.end();
