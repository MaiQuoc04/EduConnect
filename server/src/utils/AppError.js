// Throw this from services/controllers; the error middleware turns it into a JSON response.
// code = message code from Report 3 (e.g. 'MSG01') or a short machine-readable key.
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code, message, details) => new AppError(400, code, message, details);
export const unauthorized = (code, message) => new AppError(401, code, message);
export const forbidden = (code = 'FORBIDDEN', message = 'You do not have permission to do this.') =>
  new AppError(403, code, message);
export const notFound = (code = 'NOT_FOUND', message = 'Not found.') => new AppError(404, code, message);
