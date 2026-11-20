-- Written by Dung, approved by the team lead (Quoc) 21/11/2026, run on the shared DB 21/11/2026 by Dung.
-- Same definitions as in educonnect_schema_v0.3.sql.
-- Patch for a database already created from schema v0.3: settings the School Manager edits ("Cài đặt hệ thống" of the
-- School Manager). First group: the teaching load used by automatic scheduling (moved from part "4. Giáo viên" of the
-- automatic scheduling screen). Same shape as system_settings, but a separate table: system_settings is edited by the
-- System Admin only (UC-102, business rules §13) and its screen lists every row of that table.
-- Without this patch the server uses the built-in defaults (17 / 13 / 4 / 4) and saving answers 503
-- MSG_SCHOOL_SETTINGS_NOT_READY.
-- How to run: Supabase > SQL Editor > paste > Run (once; safe to run again).

BEGIN;

CREATE TABLE IF NOT EXISTS school_settings (
  setting_key   VARCHAR(100) PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL,
  description   VARCHAR(255),
  updated_by    BIGINT NULL REFERENCES users(user_id),
  updated_at    TIMESTAMPTZ NULL
);
ALTER TABLE school_settings ENABLE ROW LEVEL SECURITY;   -- like every table: only the Node server reads it

DROP TRIGGER IF EXISTS trg_school_settings_updated_at ON school_settings;
CREATE TRIGGER trg_school_settings_updated_at BEFORE UPDATE ON school_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Defaults = the values automatic scheduling used before (Thông tư 05/2025: 17 periods a week for a THPT teacher,
-- 4 less for a homeroom teacher).
INSERT INTO school_settings (setting_key, setting_value, description) VALUES
  ('teaching.norm',                '17', 'Weekly teaching norm of a teacher (periods)'),
  ('teaching.homeroom_norm',       '13', 'Weekly teaching norm of a homeroom teacher (periods)'),
  ('teaching.max_over',            '4',  'Most periods a week a teacher may teach over the norm'),
  ('teaching.max_periods_per_day', '4',  'Most periods a teacher should teach in one day (automatic scheduling)')
ON CONFLICT (setting_key) DO NOTHING;

COMMIT;
