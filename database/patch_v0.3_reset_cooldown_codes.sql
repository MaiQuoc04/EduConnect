-- Patch for a database already created from schema v0.3 (01/11/2026, business rules §3 and §13):
--   1. New system setting: minimum time between two automatic resets of one account from a password reset request.
--   2. Student / teacher codes become HS / GV + 4 digits: shorter numbers are padded (GV001 -> GV0001).
--      Usernames are not changed.
-- How to run: Supabase > SQL Editor > paste > Run (once).

BEGIN;

INSERT INTO system_settings (setting_key, setting_value, description) VALUES
  ('password_reset.request_cooldown_minutes', '15',
   'Minimum time between two automatic resets of one account from a reset request (minutes)')
ON CONFLICT (setting_key) DO NOTHING;

UPDATE teachers SET teacher_code = 'GV' || LPAD(SUBSTRING(teacher_code FROM 3), 4, '0')
WHERE teacher_code ~ '^GV[0-9]{1,3}$';

UPDATE students SET student_code = 'HS' || LPAD(SUBSTRING(student_code FROM 3), 4, '0')
WHERE student_code ~ '^HS[0-9]{1,3}$';

-- Check: both should return 0 rows
SELECT teacher_code FROM teachers WHERE teacher_code !~ '^GV[0-9]{4}$';
SELECT student_code FROM students WHERE student_code !~ '^HS[0-9]{4}$';

COMMIT;
