-- Sample data for the automatic scheduling demo (Dung, 17/11/2026): grade 10 of 2026-2027 gets 5 more classes
-- (10A2, 10A3 Khối A; 10B1 Khối B; 10C1 Khối C; 10D1 Khối D) and 12 more teachers, enough to assign and schedule the
-- 6 classes of grade 10 (with 10A1 of the small seed). No teaching assignment and no timetable: the "Xếp tự động"
-- screen makes them. Run AFTER educonnect_seed_small_v0.3.sql; on the shared DB only with the lead's OK.
-- Safe to run again (existing usernames / classes are skipped). Password of the new accounts: Educonnect@2026.
--
-- Teachers (code, account, subjects, homeroom):
--   GV0101 maiht    Toán, HĐTN             GVCN 10A2      GV0107 khoadm  Lịch sử, Địa lí, HĐTN  GVCN 10C1
--   GV0102 dungpv   Toán, Tin học                         GV0108 tambt   Lịch sử, Địa lí, KTPL
--   GV0103 huongnt  Ngữ văn, HĐTN          GVCN 10A3      GV0109 vinhdh  GDTC, QPAN
--   GV0104 anhtq    Ngữ văn, KTPL                         GV0110 tuannm  Vật lí, Công nghệ, HĐTN  GVCN 10D1
--   GV0105 ngoclb   Tiếng Anh, HĐTN        GVCN 10B1      GV0111 hanhth  Hoá học, Sinh học
--   GV0106 lanvt    Tiếng Anh                             GV0112 thaomp  Tin học, Sinh học

BEGIN;

INSERT INTO users (username, email, phone, password_hash, full_name, address, status, must_change_password)
SELECT v.username, v.username || '@educonnect.test', v.phone, '$2b$10$WyTaQucVsdDoIEG.AXse/eXWEnwa8SjKFmhmD.K6MmV0BJ.whwksW',
       v.full_name, NULL, 'ACTIVE', FALSE
FROM (VALUES
  ('maiht', '0905000201', 'Hoàng Thị Mai'),
  ('dungpv', '0905000202', 'Phạm Văn Dũng'),
  ('huongnt', '0905000203', 'Nguyễn Thu Hương'),
  ('anhtq', '0905000204', 'Trần Quốc Anh'),
  ('ngoclb', '0905000205', 'Lê Bảo Ngọc'),
  ('lanvt', '0905000206', 'Vũ Thị Lan'),
  ('khoadm', '0905000207', 'Đặng Minh Khoa'),
  ('tambt', '0905000208', 'Bùi Thanh Tâm'),
  ('vinhdh', '0905000209', 'Đỗ Hữu Vinh'),
  ('tuannm', '0905000210', 'Ngô Minh Tuấn'),
  ('hanhth', '0905000211', 'Trịnh Hồng Hạnh'),
  ('thaomp', '0905000212', 'Mai Phương Thảo')
) AS v(username, phone, full_name)
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.username = v.username);

INSERT INTO user_roles (user_id, role_id)
SELECT u.user_id, r.role_id FROM users u JOIN roles r ON r.role_code = 'TEACHER'
WHERE u.username IN ('maiht', 'dungpv', 'huongnt', 'anhtq', 'ngoclb', 'lanvt', 'khoadm', 'tambt', 'vinhdh', 'tuannm', 'hanhth', 'thaomp')
  AND NOT EXISTS (SELECT 1 FROM user_roles x WHERE x.user_id = u.user_id AND x.role_id = r.role_id);

INSERT INTO teachers (user_id, teacher_code, department)
SELECT u.user_id, v.code, v.department
FROM (VALUES
  ('maiht', 'GV0101', 'Tổ Toán – Khoa học tự nhiên'),
  ('dungpv', 'GV0102', 'Tổ Toán – Khoa học tự nhiên'),
  ('huongnt', 'GV0103', 'Tổ Ngữ văn – Khoa học xã hội'),
  ('anhtq', 'GV0104', 'Tổ Ngữ văn – Khoa học xã hội'),
  ('ngoclb', 'GV0105', 'Tổ Ngoại ngữ – Thể chất'),
  ('lanvt', 'GV0106', 'Tổ Ngoại ngữ – Thể chất'),
  ('khoadm', 'GV0107', 'Tổ Ngữ văn – Khoa học xã hội'),
  ('tambt', 'GV0108', 'Tổ Ngữ văn – Khoa học xã hội'),
  ('vinhdh', 'GV0109', 'Tổ Ngoại ngữ – Thể chất'),
  ('tuannm', 'GV0110', 'Tổ Toán – Khoa học tự nhiên'),
  ('hanhth', 'GV0111', 'Tổ Toán – Khoa học tự nhiên'),
  ('thaomp', 'GV0112', 'Tổ Toán – Khoa học tự nhiên')
) AS v(username, code, department)
JOIN users u ON u.username = v.username
WHERE NOT EXISTS (SELECT 1 FROM teachers t WHERE t.user_id = u.user_id OR t.teacher_code = v.code);

INSERT INTO teacher_subjects (teacher_id, subject_id)
SELECT t.teacher_id, s.subject_id
FROM (VALUES
  ('GV0101', 'TOAN'), ('GV0101', 'HDTN'),
  ('GV0102', 'TOAN'), ('GV0102', 'TIN'),
  ('GV0103', 'VAN'), ('GV0103', 'HDTN'),
  ('GV0104', 'VAN'), ('GV0104', 'KTPL'),
  ('GV0105', 'ANH'), ('GV0105', 'HDTN'),
  ('GV0106', 'ANH'),
  ('GV0107', 'SU'), ('GV0107', 'DIA'), ('GV0107', 'HDTN'),
  ('GV0108', 'SU'), ('GV0108', 'DIA'), ('GV0108', 'KTPL'),
  ('GV0109', 'GDTC'), ('GV0109', 'QPAN'),
  ('GV0110', 'LY'), ('GV0110', 'CN'), ('GV0110', 'HDTN'),
  ('GV0111', 'HOA'), ('GV0111', 'SINH'),
  ('GV0112', 'TIN'), ('GV0112', 'SINH')
) AS v(teacher_code, subject_code)
JOIN teachers t ON t.teacher_code = v.teacher_code
JOIN subjects s ON s.subject_code = v.subject_code
ON CONFLICT DO NOTHING;

INSERT INTO classes (class_name, grade_level_id, school_year_id, track_id, homeroom_teacher_id)
SELECT v.class_name, gl.grade_level_id, sy.school_year_id, ct.track_id, t.teacher_id
FROM (VALUES
  ('10A2', 'Khối A', 'GV0101'),
  ('10A3', 'Khối A', 'GV0103'),
  ('10B1', 'Khối B', 'GV0105'),
  ('10C1', 'Khối C', 'GV0107'),
  ('10D1', 'Khối D', 'GV0110')
) AS v(class_name, track_name, teacher_code)
JOIN school_years sy ON sy.year_name = '2026-2027'
JOIN grade_levels gl ON gl.grade_level_name = '10'
JOIN class_tracks ct ON ct.track_name = v.track_name AND ct.deleted_at IS NULL
JOIN teachers t ON t.teacher_code = v.teacher_code
WHERE NOT EXISTS (SELECT 1 FROM classes c WHERE c.class_name = v.class_name AND c.school_year_id = sy.school_year_id);

-- Class groups made with the class (UC-27): general, students, parents; the homeroom teacher joins them.
INSERT INTO groups (class_id, group_name, group_type, created_by, created_at)
SELECT c.class_id, c.class_name || g.suffix, g.type, (SELECT user_id FROM users WHERE username = 'binhnv'), NOW()
FROM classes c
JOIN school_years sy ON sy.school_year_id = c.school_year_id AND sy.year_name = '2026-2027'
CROSS JOIN (VALUES ('', 'GENERAL'), (' – Học sinh', 'STUDENT'), (' – Phụ huynh', 'PARENT')) AS g(suffix, type)
WHERE c.class_name IN ('10A2', '10A3', '10B1', '10C1', '10D1') AND c.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM groups x WHERE x.class_id = c.class_id AND x.group_type = g.type AND x.deleted_at IS NULL);

INSERT INTO group_members (group_id, user_id)
SELECT g.group_id, t.user_id
FROM groups g JOIN classes c ON c.class_id = g.class_id
JOIN teachers t ON t.teacher_id = c.homeroom_teacher_id
WHERE c.class_name IN ('10A2', '10A3', '10B1', '10C1', '10D1') AND g.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.group_id AND m.user_id = t.user_id AND m.left_at IS NULL);

-- New teachers join the school-wide teacher group.
INSERT INTO group_members (group_id, user_id)
SELECT g.group_id, t.user_id
FROM groups g CROSS JOIN teachers t
WHERE g.group_type = 'TEACHER_SCHOOL' AND g.deleted_at IS NULL AND t.teacher_code BETWEEN 'GV0101' AND 'GV0112'
  AND NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.group_id AND m.user_id = t.user_id AND m.left_at IS NULL);

COMMIT;

-- Check: 6 classes of grade 10 and the teachers per subject.
SELECT c.class_name AS lop, ct.track_name AS to_hop, u.full_name AS gvcn,
       (SELECT SUM(ts.periods_per_week) FROM track_subjects ts WHERE ts.track_id = c.track_id AND ts.school_year_id = c.school_year_id) AS tiet_tuan
FROM classes c JOIN class_tracks ct ON ct.track_id = c.track_id
LEFT JOIN teachers t ON t.teacher_id = c.homeroom_teacher_id LEFT JOIN users u ON u.user_id = t.user_id
JOIN grade_levels gl ON gl.grade_level_id = c.grade_level_id AND gl.grade_level_name = '10'
WHERE c.deleted_at IS NULL ORDER BY c.class_name;
