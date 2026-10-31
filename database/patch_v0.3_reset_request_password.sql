-- Patch for a database already created from schema v0.3 (31/10/2026, PROPOSED by FE-13, waiting for the team lead):
-- the system issues the one-time password as soon as a password reset request is sent (business-rules §3, to update).
-- The new password replaces the old one at once; the System Admin / School Manager reads it on the requests page
-- until the user signs in with it. Only an encrypted copy is kept (AES-256-GCM, key derived from JWT_SECRET) and it is
-- cleared when the request becomes DONE.
-- How to run: Supabase > SQL Editor > paste > Run (once), BEFORE starting the server with the new code.

BEGIN;

ALTER TABLE password_reset_requests ADD COLUMN temp_password_enc TEXT NULL;

-- Requests still waiting from before this change have no password: close them; the users can send a new request.
UPDATE password_reset_requests SET status = 'REJECTED', handled_at = NOW() WHERE status = 'PENDING';

COMMIT;
