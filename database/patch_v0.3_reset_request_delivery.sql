-- Patch for a database already created from schema v0.3 (01/11/2026, business rules §3): every automatic reset from
-- a password reset request is listed for System Admin / School Manager. delivery = EMAIL (the temporary password was
-- emailed, nothing to do) or SCHOOL (no email: SA / SM hand the password over). Existing requests were all SCHOOL.
-- How to run: Supabase > SQL Editor > paste > Run (once).

BEGIN;

ALTER TABLE password_reset_requests ADD COLUMN delivery VARCHAR(10) NOT NULL DEFAULT 'SCHOOL';
ALTER TABLE password_reset_requests ADD CONSTRAINT password_reset_requests_delivery_check
  CHECK (delivery IN ('EMAIL', 'SCHOOL'));

COMMIT;
