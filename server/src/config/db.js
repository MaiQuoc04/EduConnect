import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { env } from './env.js';

// Type parsers (apply to every query):
// - BIGINT (ids, COUNT(*)) -> Number instead of string; our ids stay far below 2^53.
// - DATE / TIMESTAMP / TIMESTAMPTZ -> the string Postgres sends, in the DB time zone (Asia/Ho_Chi_Minh),
//   e.g. "2026-10-21" or "2026-10-21 08:30:00+07". Avoids JS Date shifting values to UTC.
// - NUMERIC (weights, scores) stays a string, so decimals are not rounded.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
for (const oid of [pg.types.builtins.DATE, pg.types.builtins.TIMESTAMP, pg.types.builtins.TIMESTAMPTZ]) {
  pg.types.setTypeParser(oid, (v) => v);
}

function sslOptions() {
  if (!env.db.ssl) return false;
  if (!env.db.sslCa) return { rejectUnauthorized: false }; // encrypted, server certificate not verified
  const caPath = path.resolve(process.cwd(), env.db.sslCa);
  if (!fs.existsSync(caPath)) {
    throw new Error(`DB_SSL_CA is set but the CA file was not found at ${caPath}. Download it from Supabase or leave DB_SSL_CA empty.`);
  }
  return { ca: fs.readFileSync(caPath, 'utf8'), rejectUnauthorized: true };
}

// One shared pool for the whole app. pool.query(sql, params) returns { rows, rowCount }; placeholders are $1, $2…
export const pool = new pg.Pool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  ssl: sslOptions(),
  max: env.db.poolMax, // the Supabase Free pooler is shared by the whole team
  idleTimeoutMillis: 30_000,
});

// An idle client that loses its connection (pooler restart, network) must not crash the server.
pool.on('error', (err) => console.error('Database pool error:', err.message));

// Runs fn(client) inside a transaction; commits on success, rolls back on error.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
