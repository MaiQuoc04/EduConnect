-- Patch for a database already created from schema v0.3 (FE-13, 31/10/2026; agreed 01/11/2026, business rules §3):
-- a matching password reset request resets the password at once. For an account without email the System Admin /
-- School Manager reads the temporary password on the requests page until the user signs in with it. Only an encrypted
-- copy is kept (AES-256-GCM, key derived from JWT_SECRET) and it is cleared when the request becomes DONE.
-- Already run on the shared database (31/10/2026); only needed for another (local) database.

BEGIN;

ALTER TABLE password_reset_requests ADD COLUMN temp_password_enc TEXT NULL;

-- Requests still waiting from before this change have no password: close them; the users can send a new request.
UPDATE password_reset_requests SET status = 'REJECTED', handled_at = NOW() WHERE status = 'PENDING';

COMMIT;
