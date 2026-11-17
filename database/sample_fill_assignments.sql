-- Sample data for testing (Dung, 18/11/2026): fills the teaching assignments that are still missing in the school
-- year running today, so teachers without classes get some and every class can get a timetable / teaching schedule.
--   * Only (class, subject) pairs of the class type (track_subjects) with NO current or future assignment are filled;
--     existing assignments are never changed (FE-03 rules: one teacher per class and subject, start today or later
--     – never back-dated –, end = end of the school year, only subjects the teacher can teach, no locked teacher).
--   * Hardest first (subjects with the fewest teachers); HĐTN goes to the class's homeroom teacher when possible;
--     otherwise the teacher with the lowest load, so teachers without any class come first. A teacher stays within
--     norm + 4 periods/week (17 + 4, homeroom teacher 13 + 4, Circular 05/2025); a pair nobody can take is skipped
--     and listed by a NOTICE.
--   * The new teachers join the general group of the class (as FE-03 does).
-- No timetable is made here: after running it, open "Xếp tự động" (mode "Chỉ xếp tiết (dùng phân công đang có)")
-- for each grade to make the timetables, then the teachers' "Lịch dạy" shows their lessons.
-- One statement (DO block), works in the Supabase SQL Editor. Safe to run again (filled pairs are skipped).
-- On the shared DB only with the lead's OK.

DO $$
DECLARE
  yr RECORD;
  start_day DATE;
  pair RECORD;
  pick BIGINT;
  added INT := 0;
  skipped INT := 0;
BEGIN
  SELECT school_year_id, start_date, end_date, year_name INTO yr
  FROM school_years WHERE CURRENT_DATE BETWEEN start_date AND end_date ORDER BY start_date DESC LIMIT 1;
  IF yr IS NULL THEN
    RAISE NOTICE 'No school year runs today - nothing to do.';
    RETURN;
  END IF;
  start_day := GREATEST(CURRENT_DATE, yr.start_date);

  FOR pair IN
    SELECT c.class_id, c.class_name, c.homeroom_teacher_id, ts.subject_id, s.subject_code, s.subject_name,
           ts.periods_per_week,
           (SELECT COUNT(*) FROM teacher_subjects x JOIN teachers t ON t.teacher_id = x.teacher_id
              JOIN users u ON u.user_id = t.user_id AND u.status = 'ACTIVE'
            WHERE x.subject_id = ts.subject_id) AS n_teachers
    FROM classes c
    JOIN track_subjects ts ON ts.track_id = c.track_id AND ts.school_year_id = c.school_year_id
    JOIN subjects s ON s.subject_id = ts.subject_id
    WHERE c.school_year_id = yr.school_year_id AND c.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM teaching_assignments a
                      WHERE a.class_id = c.class_id AND a.subject_id = ts.subject_id AND a.deleted_at IS NULL
                        AND a.end_date >= start_day)
    ORDER BY n_teachers, ts.periods_per_week DESC, c.class_name, s.subject_code
  LOOP
    WITH cand AS (
      SELECT t.teacher_id, t.teacher_code,
             (t.teacher_id = pair.homeroom_teacher_id) AS is_hr,
             EXISTS (SELECT 1 FROM classes h WHERE h.homeroom_teacher_id = t.teacher_id
                     AND h.school_year_id = yr.school_year_id AND h.deleted_at IS NULL) AS homeroom_somewhere,
             COALESCE((SELECT SUM(tsx.periods_per_week)
                       FROM teaching_assignments a
                       JOIN classes ca ON ca.class_id = a.class_id AND ca.deleted_at IS NULL
                       JOIN track_subjects tsx ON tsx.track_id = ca.track_id AND tsx.school_year_id = ca.school_year_id
                                              AND tsx.subject_id = a.subject_id
                       WHERE a.teacher_id = t.teacher_id AND a.deleted_at IS NULL AND a.end_date >= start_day
                         AND ca.school_year_id = yr.school_year_id), 0) AS load
      FROM teacher_subjects x
      JOIN teachers t ON t.teacher_id = x.teacher_id
      JOIN users u ON u.user_id = t.user_id AND u.status = 'ACTIVE'
      WHERE x.subject_id = pair.subject_id
    )
    SELECT teacher_id INTO pick
    FROM cand
    WHERE load + pair.periods_per_week <= (CASE WHEN homeroom_somewhere THEN 13 ELSE 17 END) + 4
    ORDER BY (pair.subject_code = 'HDTN' AND is_hr) DESC,           -- HĐTN: the homeroom teacher of the class
             (pair.subject_code = 'HDTN' AND homeroom_somewhere) DESC, -- else another homeroom teacher
             load::numeric / ((CASE WHEN homeroom_somewhere THEN 13 ELSE 17 END) + 4), -- lightest first
             teacher_code
    LIMIT 1;

    IF pick IS NULL THEN
      skipped := skipped + 1;
      RAISE NOTICE 'Skipped %: % (% periods/week) - no teacher of this subject has room left.',
        pair.class_name, pair.subject_name, pair.periods_per_week;
      CONTINUE;
    END IF;

    INSERT INTO teaching_assignments (class_id, subject_id, teacher_id, start_date, end_date)
    VALUES (pair.class_id, pair.subject_id, pick, start_day, yr.end_date);
    added := added + 1;

    -- The subject teacher joins the class's general group (FE-03 / FE-04).
    INSERT INTO group_members (group_id, user_id)
    SELECT g.group_id, t.user_id
    FROM groups g JOIN teachers t ON t.teacher_id = pick
    WHERE g.class_id = pair.class_id AND g.group_type = 'GENERAL' AND g.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.group_id AND m.user_id = t.user_id AND m.left_at IS NULL);
    pick := NULL;
  END LOOP;

  RAISE NOTICE 'School year %: % assignments added (from %), % pairs skipped.', yr.year_name, added, start_day, skipped;
END $$;

-- Check: every active teacher with the classes / periods per week they teach from today (0 = still no class).
SELECT t.teacher_code AS ma_gv, u.full_name AS giao_vien,
       (SELECT string_agg(s.subject_name, ', ' ORDER BY s.subject_name) FROM teacher_subjects x
        JOIN subjects s ON s.subject_id = x.subject_id WHERE x.teacher_id = t.teacher_id) AS mon_day_duoc,
       (SELECT c.class_name FROM classes c JOIN school_years sy ON sy.school_year_id = c.school_year_id
        WHERE c.homeroom_teacher_id = t.teacher_id AND c.deleted_at IS NULL AND CURRENT_DATE BETWEEN sy.start_date AND sy.end_date
        LIMIT 1) AS gvcn_lop,
       COUNT(DISTINCT a.class_id) AS so_lop,
       COALESCE(SUM(tsx.periods_per_week), 0) AS tiet_tuan
FROM teachers t
JOIN users u ON u.user_id = t.user_id AND u.status = 'ACTIVE'
LEFT JOIN teaching_assignments a ON a.teacher_id = t.teacher_id AND a.deleted_at IS NULL AND a.end_date >= CURRENT_DATE
LEFT JOIN classes ca ON ca.class_id = a.class_id AND ca.deleted_at IS NULL
LEFT JOIN track_subjects tsx ON tsx.track_id = ca.track_id AND tsx.school_year_id = ca.school_year_id AND tsx.subject_id = a.subject_id
GROUP BY t.teacher_id, t.teacher_code, u.full_name
ORDER BY tiet_tuan, t.teacher_code;
