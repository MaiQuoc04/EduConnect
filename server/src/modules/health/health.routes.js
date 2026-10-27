import { Router } from 'express';
import { pool } from '../../config/db.js';

const router = Router();

// GET /api/v1/health – checks that the API runs and the database answers.
router.get('/', async (_req, res) => {
  const [rows] = await pool.query('SELECT VERSION() AS version, current_database() AS db');
  res.json({ status: 'ok', postgres: rows[0].version, database: rows[0].db });
});

export default router;
