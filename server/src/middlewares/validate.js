// Runs a validator `(req) => data` before the controller and stores the clean data in req.validated.
// Validators throw AppError (400 / 404); Express forwards them to errorHandler.
export function validate(validator) {
  return (req, _res, next) => {
    try {
      req.validated = validator(req);
      next();
    } catch (err) {
      next(err);
    }
  };
}
