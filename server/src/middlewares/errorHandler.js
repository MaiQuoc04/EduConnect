import { AppError } from '../utils/AppError.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ code: 'NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} not found.` });
}

// Every error response has the same shape: { code, message, details? }
export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ code: err.code, message: err.message, details: err.details });
  }
  if (err.code === '23505') { // PostgreSQL unique_violation
    return res.status(409).json({ code: 'DUPLICATE', message: 'This value already exists.' });
  }
  console.error(err);
  res.status(500).json({ code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' });
}
