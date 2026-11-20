-- EduConnect patch for schema v0.3 – no more "every grade" class types (FE-04 UC-26, SCR-70).
-- Asked by Khanh 20/11/2026: the "Mọi khối" tab of SCR-70 is removed, so every class type belongs to one grade.
-- No schema change, data only. Run after patch_v0.3_class_track_grade.sql.
-- Already run on the shared DB (20/11/2026; new types id 33–40) – only needed for another (local) database.
--
-- Each class type that is not deleted and has grade_level_id NULL becomes one type per grade (10, 11, 12):
--   * the type itself keeps its id and takes the first grade;
--   * for every other grade a copy is created (same name and description) with a copy of all its
--     track_subjects rows (every school year: subjects, weight, periods per week);
--   * each class that uses the type moves to the copy of its own grade.
-- Grades already entered keep working: they hang on classes / subjects, not on class types.
-- Deleted "every grade" types are left as they are (history).
--
-- Stops (and changes nothing) if a grade already has a type with the same name.

BEGIN;

DO $$
DECLARE
  t RECORD;
  g RECORD;
  first_grade BOOLEAN;
  new_id BIGINT;
BEGIN
  FOR t IN SELECT track_id, track_name, description FROM class_tracks
           WHERE grade_level_id IS NULL AND deleted_at IS NULL ORDER BY track_id LOOP
    first_grade := TRUE;
    FOR g IN SELECT grade_level_id, grade_level_name FROM grade_levels ORDER BY grade_level_name LOOP
      IF EXISTS (SELECT 1 FROM class_tracks WHERE deleted_at IS NULL AND grade_level_id = g.grade_level_id
                 AND lower(track_name) = lower(t.track_name)) THEN
        RAISE EXCEPTION 'Grade % already has a class type named "%"', g.grade_level_name, t.track_name;
      END IF;

      IF first_grade THEN
        UPDATE class_tracks SET grade_level_id = g.grade_level_id WHERE track_id = t.track_id;
        first_grade := FALSE;
      ELSE
        INSERT INTO class_tracks (track_name, description, grade_level_id)
        VALUES (t.track_name, t.description, g.grade_level_id)
        RETURNING track_id INTO new_id;

        INSERT INTO track_subjects (track_id, subject_id, school_year_id, weight, periods_per_week)
        SELECT new_id, subject_id, school_year_id, weight, periods_per_week
        FROM track_subjects WHERE track_id = t.track_id;

        UPDATE classes SET track_id = new_id WHERE track_id = t.track_id AND grade_level_id = g.grade_level_id;
      END IF;
    END LOOP;
  END LOOP;
END $$;

COMMIT;
