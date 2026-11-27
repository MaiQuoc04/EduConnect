-- Written by Dung 24/11/2026. APPROVED by the team lead (Quoc) 27/11/2026 – to be run on the shared DB (not run yet).
-- Moves the attendance deadline of the subject teacher (business rules §12: "can edit until 23:59 the same day") from
-- the System Admin settings (system_settings, UC-102) to the School Manager settings (school_settings, "Cài đặt hệ
-- thống" of the School Manager). The value in force is kept. Needs patch_v0.3_school_settings.sql (run 21/11/2026).
-- Same definitions as in educonnect_schema_v0.3.sql.
-- Before this patch the server already reads school_settings first and falls back to the system_settings row, so
-- the app works the same before and after it; after it the System Admin no longer sees the setting.
-- The row is deleted from system_settings (a configuration table without deleted_at, keys are loaded by SQL) so the
-- System Admin screen, which lists every row of that table, stops showing a value that no longer applies.
-- How to run (after the lead's OK): Supabase > SQL Editor > paste > Run (once; safe to run again).

BEGIN;

INSERT INTO school_settings (setting_key, setting_value, description)
SELECT 'attendance.edit_deadline_time',
       COALESCE((SELECT setting_value FROM system_settings WHERE setting_key = 'attendance.edit_deadline_time'), '23:59'),
       'Subject teacher can edit attendance until this time on the same day (HH:MM)'
ON CONFLICT (setting_key) DO NOTHING;

DELETE FROM system_settings WHERE setting_key = 'attendance.edit_deadline_time';

COMMIT;
