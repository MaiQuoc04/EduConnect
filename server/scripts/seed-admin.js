// npm run seed:admin -- <username> <full name> <password>
// Creates the first System Admin account (run once per database). The password is hashed, never stored as text.
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../src/config/db.js';

const [username, fullName, password] = process.argv.slice(2);
if (!username || !fullName || !password) {
  console.error('Usage: npm run seed:admin -- <username> "<full name>" <password>');
  process.exit(1);
}

try {
  const hash = await bcrypt.hash(password, 10);
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO users (username, full_name, password_hash, must_change_password) VALUES ($1, $2, $3, FALSE)
       RETURNING user_id`,
      [username, fullName, hash],
    );
    await client.query(
      "INSERT INTO user_roles (user_id, role_id) SELECT $1, role_id FROM roles WHERE role_code = 'SYSTEM_ADMIN'",
      [rows[0].user_id],
    );
  });
  console.log(`System Admin "${username}" created.`);
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
