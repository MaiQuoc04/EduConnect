import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

function sslOptions() {
  if (!env.db.ssl) return false;
  // If no CA path is configured, connect with TLS but skip certificate verification.
  // Appropriate for Supabase / managed clouds that use well-known CAs.
  return { rejectUnauthorized: false };
}

// One shared pool for the whole app.
const _pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  ssl: sslOptions(),
  max: env.db.poolMax,
});

// Converts ? placeholders to $1, $2, ... for PostgreSQL
function toPostgres(text) {
  let i = 0;
  return text.replace(/\?/g, () => `$${++i}`);
}

// pool.query wrapper: converts ? → $n and returns [rows, fields] like mysql2
export const pool = {
  query: (text, params) =>
    _pool.query(toPostgres(text), params).then((r) => [r.rows, r.fields]),
  end: () => _pool.end(),
};

// Runs fn(conn) inside a transaction; commits on success, rolls back on error.
export async function withTransaction(fn) {
  const conn = await _pool.connect();
  try {
    await conn.query('BEGIN');
    const wrappedConn = {
      query: (text, params) =>
        conn.query(toPostgres(text), params).then((r) => [r.rows, r.fields]),
    };
    const result = await fn(wrappedConn);
    await conn.query('COMMIT');
    return result;
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
}
