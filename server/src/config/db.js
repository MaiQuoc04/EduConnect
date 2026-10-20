import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { env } from './env.js';

function sslOptions() {
  if (!env.db.ssl) return undefined;
  const caPath = path.resolve(process.cwd(), env.db.sslCa);
  if (!fs.existsSync(caPath)) {
    throw new Error(`DB_SSL=true but CA file not found at ${caPath}. Download ca.pem from Aiven.`);
  }
  return { ca: fs.readFileSync(caPath, 'utf8'), rejectUnauthorized: true };
}

// One shared pool for the whole app. Use pool.query / pool.execute, or getConnection() for transactions.
export const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  ssl: sslOptions(),
  waitForConnections: true,
  connectionLimit: 10, // Aiven Free allows 76 connections shared by the whole team
  dateStrings: true,
  timezone: '+07:00',
  charset: 'utf8mb4',
});

// Runs fn(conn) inside a transaction; commits on success, rolls back on error.
export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
