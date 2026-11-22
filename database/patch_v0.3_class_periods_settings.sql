-- Patch for a database already created from schema v0.3 (22/11/2026, FE-13, Linh; agreed with the lead, run on the shared DB 22/11):
--   Two new system settings (UC-102): the smallest and the largest total of periods per week of one class (sum of
--   track_subjects.periods_per_week of its class type). System Admin edits them on "Cài đặt hệ thống".
--   ASSUMPTION: defaults 25 and 35; allowed 1-48 each (6 days x 8 periods), minimum <= maximum.
-- How to run: Supabase > SQL Editor > paste > Run (once). Only adds rows; running it again changes nothing.

BEGIN;

INSERT INTO system_settings (setting_key, setting_value, description) VALUES
  ('timetable.class_periods_min', '25', 'Smallest total of periods per week of one class'),
  ('timetable.class_periods_max', '35', 'Largest total of periods per week of one class')
ON CONFLICT (setting_key) DO NOTHING;

-- Check: should return 2 rows
SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'timetable.class_periods_%';

COMMIT;
