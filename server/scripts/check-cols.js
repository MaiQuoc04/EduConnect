import { pool } from '../src/config/db.js';

const [cols] = await pool.query(
  "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position"
);
console.log('users columns:', cols.map(r => r.column_name).join(', '));

const [tcols] = await pool.query(
  "SELECT column_name FROM information_schema.columns WHERE table_name = 'teachers' ORDER BY ordinal_position"
);
console.log('teachers columns:', tcols.map(r => r.column_name).join(', '));

await pool.end();
