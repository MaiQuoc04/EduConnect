-- EduConnect patch for schema v0.3 – class types per grade (FE-04 UC-26, SCR-70).
-- Proposed by the team lead (02/11/2026), reviewed by Khanh, approved to run on the shared DB.
--
-- A class type (class_tracks) belongs to one grade or to every grade (grade_level_id NULL). Before this patch the
-- grade was written as a prefix of track_name ("10 · Khối A", commit 1a4d4fc); this moves it to its own column.
--
-- Rules (business-rules §4):
--   * a class can only use a class type of its grade or one for every grade (checked in code, in SQL);
--   * a name is unique per grade, without case, among types that are not deleted (index below) – the name of a
--     deleted type can be used again;
--   * a name is used either for every grade or per grade, not both (checked in code).
--
-- Run once. Order matters: the old UNIQUE (track_name) must go before the prefixes are removed, otherwise
-- "10 · Khối A" -> "Khối A" would clash with an existing "Khối A".

BEGIN;

ALTER TABLE class_tracks ADD COLUMN grade_level_id BIGINT NULL REFERENCES grade_levels(grade_level_id);

ALTER TABLE class_tracks DROP CONSTRAINT class_tracks_track_name_key;

-- Types created with a "10 · " prefix: move the grade to the new column and drop the prefix from the name.
UPDATE class_tracks ct
SET grade_level_id = gl.grade_level_id,
    track_name     = SUBSTRING(ct.track_name FROM '^(?:10|11|12) · (.+)$')
FROM grade_levels gl
WHERE gl.grade_level_name = SUBSTRING(ct.track_name FROM '^(10|11|12) · ');

-- One name per grade (NULL = every grade), compared without case like the code does.
CREATE UNIQUE INDEX uq_class_tracks_grade_name
  ON class_tracks (COALESCE(grade_level_id, 0), lower(track_name))
  WHERE deleted_at IS NULL;

COMMIT;
