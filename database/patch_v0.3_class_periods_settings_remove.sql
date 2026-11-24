-- Patch (23/11/2026, FE-13, Linh): removes the two system settings added by patch_v0.3_class_periods_settings.sql
-- (timetable.class_periods_min / _max, run on the shared DB 22/11/2026). The settings were dropped from
-- "Cài đặt hệ thống" on 23/11/2026; nothing reads them. Running it again changes nothing.
-- How to run: Supabase > SQL Editor > paste > Run (once).

BEGIN;

DELETE FROM system_settings WHERE setting_key IN ('timetable.class_periods_min', 'timetable.class_periods_max');

-- Check: should return 0 rows
SELECT setting_key FROM system_settings WHERE setting_key LIKE 'timetable.class_periods_%';

COMMIT;
