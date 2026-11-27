-- Patch for a database already created from schema v0.3 (27/11/2026, FE-11, Linh): subjects assessed by comments
-- (môn đánh giá bằng nhận xét – Giáo dục thể chất, Nghệ thuật, Hoạt động trải nghiệm, Giáo dục địa phương…), Circular
-- 22/2021/TT-BGDĐT. Each assessment of such a subject is Đạt / Chưa đạt instead of a score.
--   grade_components.assessment_type: SCORE (scored, as before) or COMMENT. Every component of one structure
--     (subject × grade level × semester) has the same type, and so do the structures of one subject × grade level in
--     a school year (code). A COMMENT component has no real weight; it is stored as 1.
--   grades.result: PASS (Đạt) / FAIL (Chưa đạt) for a COMMENT component, NULL otherwise; a row has a score or a
--     result, never both. Clearing a result = result NULL (rows are never deleted).
--   grade_histories.old_result / new_result: the same change log for results.
-- Same definitions as in educonnect_schema_v0.3.sql. Existing rows are SCORE structures and scores, unchanged.
-- How to run: ONLY after the lead approves. Supabase > SQL Editor > paste > Run (once; running it again changes
-- nothing). The last SELECT counts the structures of each type.

BEGIN;

ALTER TABLE grade_components ADD COLUMN IF NOT EXISTS assessment_type VARCHAR(10) NOT NULL DEFAULT 'SCORE';
ALTER TABLE grade_components DROP CONSTRAINT IF EXISTS grade_components_assessment_type_check;
ALTER TABLE grade_components ADD CONSTRAINT grade_components_assessment_type_check
  CHECK (assessment_type IN ('SCORE', 'COMMENT'));

ALTER TABLE grades ADD COLUMN IF NOT EXISTS result VARCHAR(10) NULL;
ALTER TABLE grades DROP CONSTRAINT IF EXISTS grades_result_check;
ALTER TABLE grades ADD CONSTRAINT grades_result_check
  CHECK (result IS NULL OR (result IN ('PASS', 'FAIL') AND score IS NULL));

ALTER TABLE grade_histories ADD COLUMN IF NOT EXISTS old_result VARCHAR(10) NULL;
ALTER TABLE grade_histories ADD COLUMN IF NOT EXISTS new_result VARCHAR(10) NULL;
ALTER TABLE grade_histories DROP CONSTRAINT IF EXISTS grade_histories_result_check;
ALTER TABLE grade_histories ADD CONSTRAINT grade_histories_result_check
  CHECK ((old_result IS NULL OR old_result IN ('PASS', 'FAIL')) AND (new_result IS NULL OR new_result IN ('PASS', 'FAIL')));

COMMIT;

SELECT assessment_type, COUNT(*) AS components,
       COUNT(DISTINCT (subject_id, grade_level_id, semester_id)) AS structures
FROM grade_components GROUP BY assessment_type ORDER BY assessment_type;
