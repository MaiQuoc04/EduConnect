-- Sample data for grades 11 and 12 of 2026-2027 (Dung, 17/11/2026), so the "Xếp tự động" screen and the timetable
-- screens can be shown on three grades. Adds 20 teachers (GV0113–GV0132) and 9 classes:
--   * grade 11: 11A1, 11A2, 11B1, 11C1 (with 11D1 of the small seed) WITH teaching assignments for the whole year
--     -> demo "Chỉ xếp tiết (dùng phân công đang có)" on grade 11;
--   * grade 12: 12A1, 12A2, 12B1, 12C1, 12D1 WITHOUT assignments -> demo "Phân công + xếp tiết" on grade 12.
-- No timetable is made here: the screen makes it. No existing row is changed or deleted.
-- Run AFTER educonnect_seed_small_v0.3.sql (sample_auto_schedule.sql is not needed but works with it);
-- on the shared DB only with the lead's OK. Safe to run again (existing usernames / codes / classes are skipped).
-- Password of the new accounts: Educonnect@2026.
--
-- Teachers (code, account, subjects, homeroom):
--   GV0113 phuongdt Toán, HĐTN                 GVCN 11A1   GV0123 hieult   Toán, Tin học
--   GV0114 hoalt    Ngữ văn, HĐTN              GVCN 11A2   GV0124 yennh    Ngữ văn
--   GV0115 trangnh  Tiếng Anh, HĐTN            GVCN 11B1   GV0125 vyld     Tiếng Anh
--   GV0116 sonpt    Lịch sử, Địa lí, HĐTN      GVCN 11C1   GV0126 phongnq  Lịch sử, KTPL
--   GV0117 hungdv   Vật lí, HĐTN               GVCN 12A1   GV0127 giangtt  Địa lí, Lịch sử
--   GV0118 nganvt   Hoá học, HĐTN              GVCN 12A2   GV0128 cuongbv  GDTC, QPAN
--   GV0119 quynhlt  Sinh học, HĐTN             GVCN 12B1   GV0129 thangdq  GDTC, QPAN
--   GV0120 thuvh    Ngữ văn, KTPL, HĐTN        GVCN 12C1   GV0130 hailm    Vật lí, Công nghệ
--   GV0121 loanpk   Tiếng Anh, HĐTN            GVCN 12D1   GV0131 nhungpt  Hoá học, Sinh học
--   GV0122 namtv    Toán                                   GV0132 kienhd   Tin học, Công nghệ

BEGIN;

CREATE TEMP TABLE tmp_t (username TEXT, phone TEXT, full_name TEXT, code TEXT, department TEXT, subjects TEXT[]) ON COMMIT DROP;
INSERT INTO tmp_t VALUES
  ('phuongdt', '0905000213', 'Đỗ Thu Phương',     'GV0113', 'Tổ Toán – Khoa học tự nhiên',   '{TOAN,HDTN}'),
  ('hoalt',    '0905000214', 'Lê Thị Hoa',        'GV0114', 'Tổ Ngữ văn – Khoa học xã hội',  '{VAN,HDTN}'),
  ('trangnh',  '0905000215', 'Nguyễn Huyền Trang', 'GV0115', 'Tổ Ngoại ngữ – Thể chất',      '{ANH,HDTN}'),
  ('sonpt',    '0905000216', 'Phan Thanh Sơn',    'GV0116', 'Tổ Ngữ văn – Khoa học xã hội',  '{SU,DIA,HDTN}'),
  ('hungdv',   '0905000217', 'Đinh Văn Hùng',     'GV0117', 'Tổ Toán – Khoa học tự nhiên',   '{LY,HDTN}'),
  ('nganvt',   '0905000218', 'Võ Thanh Ngân',     'GV0118', 'Tổ Toán – Khoa học tự nhiên',   '{HOA,HDTN}'),
  ('quynhlt',  '0905000219', 'Lý Thúy Quỳnh',     'GV0119', 'Tổ Toán – Khoa học tự nhiên',   '{SINH,HDTN}'),
  ('thuvh',    '0905000220', 'Vương Hoài Thu',    'GV0120', 'Tổ Ngữ văn – Khoa học xã hội',  '{VAN,KTPL,HDTN}'),
  ('loanpk',   '0905000221', 'Phạm Kim Loan',     'GV0121', 'Tổ Ngoại ngữ – Thể chất',       '{ANH,HDTN}'),
  ('namtv',    '0905000222', 'Trương Văn Nam',    'GV0122', 'Tổ Toán – Khoa học tự nhiên',   '{TOAN}'),
  ('hieult',   '0905000223', 'Lâm Trung Hiếu',    'GV0123', 'Tổ Toán – Khoa học tự nhiên',   '{TOAN,TIN}'),
  ('yennh',    '0905000224', 'Nguyễn Hải Yến',    'GV0124', 'Tổ Ngữ văn – Khoa học xã hội',  '{VAN}'),
  ('vyld',     '0905000225', 'Lưu Diệu Vy',       'GV0125', 'Tổ Ngoại ngữ – Thể chất',       '{ANH}'),
  ('phongnq',  '0905000226', 'Nguyễn Quốc Phong', 'GV0126', 'Tổ Ngữ văn – Khoa học xã hội',  '{SU,KTPL}'),
  ('giangtt',  '0905000227', 'Tạ Thu Giang',      'GV0127', 'Tổ Ngữ văn – Khoa học xã hội',  '{DIA,SU}'),
  ('cuongbv',  '0905000228', 'Bùi Văn Cường',     'GV0128', 'Tổ Ngoại ngữ – Thể chất',       '{GDTC,QPAN}'),
  ('thangdq',  '0905000229', 'Dương Quang Thắng', 'GV0129', 'Tổ Ngoại ngữ – Thể chất',       '{GDTC,QPAN}'),
  ('hailm',    '0905000230', 'Lê Minh Hải',       'GV0130', 'Tổ Toán – Khoa học tự nhiên',   '{LY,CN}'),
  ('nhungpt',  '0905000231', 'Phùng Tuyết Nhung', 'GV0131', 'Tổ Toán – Khoa học tự nhiên',   '{HOA,SINH}'),
  ('kienhd',   '0905000232', 'Hà Duy Kiên',       'GV0132', 'Tổ Toán – Khoa học tự nhiên',   '{TIN,CN}');

INSERT INTO users (username, email, phone, password_hash, full_name, address, status, must_change_password)
SELECT v.username, v.username || '@educonnect.test', v.phone, '$2b$10$WyTaQucVsdDoIEG.AXse/eXWEnwa8SjKFmhmD.K6MmV0BJ.whwksW',
       v.full_name, NULL, 'ACTIVE', FALSE
FROM tmp_t v
WHERE NOT EXISTS (SELECT 1 FROM users u
                  WHERE u.username = v.username OR u.phone = v.phone OR u.email = v.username || '@educonnect.test');

INSERT INTO user_roles (user_id, role_id)
SELECT u.user_id, r.role_id FROM tmp_t v JOIN users u ON u.username = v.username JOIN roles r ON r.role_code = 'TEACHER'
WHERE NOT EXISTS (SELECT 1 FROM user_roles x WHERE x.user_id = u.user_id AND x.role_id = r.role_id);

INSERT INTO teachers (user_id, teacher_code, department)
SELECT u.user_id, v.code, v.department
FROM tmp_t v JOIN users u ON u.username = v.username
WHERE NOT EXISTS (SELECT 1 FROM teachers t WHERE t.user_id = u.user_id OR t.teacher_code = v.code);

INSERT INTO teacher_subjects (teacher_id, subject_id)
SELECT t.teacher_id, s.subject_id
FROM tmp_t v
JOIN users u ON u.username = v.username
JOIN teachers t ON t.teacher_code = v.code AND t.user_id = u.user_id
CROSS JOIN LATERAL unnest(v.subjects) AS x(code)
JOIN subjects s ON s.subject_code = x.code
ON CONFLICT DO NOTHING;

-- Classes and their homeroom teachers.
CREATE TEMP TABLE tmp_c (class_name TEXT, grade TEXT, track_name TEXT, teacher_code TEXT) ON COMMIT DROP;
INSERT INTO tmp_c VALUES
  ('11A1', '11', 'Khối A', 'GV0113'), ('11A2', '11', 'Khối A', 'GV0114'), ('11B1', '11', 'Khối B', 'GV0115'),
  ('11C1', '11', 'Khối C', 'GV0116'),
  ('12A1', '12', 'Khối A', 'GV0117'), ('12A2', '12', 'Khối A', 'GV0118'), ('12B1', '12', 'Khối B', 'GV0119'),
  ('12C1', '12', 'Khối C', 'GV0120'), ('12D1', '12', 'Khối D', 'GV0121');

INSERT INTO classes (class_name, grade_level_id, school_year_id, track_id, homeroom_teacher_id)
SELECT v.class_name, gl.grade_level_id, sy.school_year_id, ct.track_id, t.teacher_id
FROM tmp_c v
JOIN school_years sy ON sy.year_name = '2026-2027'
JOIN grade_levels gl ON gl.grade_level_name = v.grade
JOIN class_tracks ct ON ct.track_name = v.track_name AND ct.deleted_at IS NULL
JOIN teachers t ON t.teacher_code = v.teacher_code
WHERE NOT EXISTS (SELECT 1 FROM classes c WHERE c.class_name = v.class_name AND c.school_year_id = sy.school_year_id
                  AND c.deleted_at IS NULL)
  -- a teacher is homeroom of at most one class of the year
  AND NOT EXISTS (SELECT 1 FROM classes c WHERE c.homeroom_teacher_id = t.teacher_id AND c.school_year_id = sy.school_year_id
                  AND c.deleted_at IS NULL);

-- Only the classes made by this file (their homeroom teacher is one of the new teachers) get groups and assignments.
CREATE TEMP TABLE tmp_mine ON COMMIT DROP AS
SELECT c.class_id, c.class_name, c.school_year_id, c.homeroom_teacher_id
FROM classes c
JOIN tmp_c v ON v.class_name = c.class_name
JOIN teachers t ON t.teacher_id = c.homeroom_teacher_id AND t.teacher_code = v.teacher_code
JOIN school_years sy ON sy.school_year_id = c.school_year_id AND sy.year_name = '2026-2027'
WHERE c.deleted_at IS NULL;

-- Class groups made with the class (UC-27): general, students, parents.
INSERT INTO groups (class_id, group_name, group_type, created_by, created_at)
SELECT m.class_id, m.class_name || g.suffix, g.type, (SELECT user_id FROM users WHERE username = 'binhnv'), NOW()
FROM tmp_mine m
CROSS JOIN (VALUES ('', 'GENERAL'), (' – Học sinh', 'STUDENT'), (' – Phụ huynh', 'PARENT')) AS g(suffix, type)
WHERE NOT EXISTS (SELECT 1 FROM groups x WHERE x.class_id = m.class_id AND x.group_type = g.type AND x.deleted_at IS NULL);

-- Teaching assignments of grade 11 for the whole year (FE-03). Grade 12 has none on purpose.
INSERT INTO teaching_assignments (class_id, subject_id, teacher_id, start_date, end_date)
SELECT m.class_id, s.subject_id, t.teacher_id, sy.start_date, sy.end_date
FROM (VALUES
  ('11A1', 'TOAN', 'GV0113'), ('11A1', 'VAN', 'GV0124'), ('11A1', 'ANH', 'GV0125'), ('11A1', 'SU', 'GV0126'),
  ('11A1', 'GDTC', 'GV0128'), ('11A1', 'QPAN', 'GV0128'), ('11A1', 'HDTN', 'GV0113'), ('11A1', 'LY', 'GV0130'),
  ('11A1', 'HOA', 'GV0131'), ('11A1', 'SINH', 'GV0131'), ('11A1', 'TIN', 'GV0123'),
  ('11A2', 'TOAN', 'GV0122'), ('11A2', 'VAN', 'GV0114'), ('11A2', 'ANH', 'GV0125'), ('11A2', 'SU', 'GV0127'),
  ('11A2', 'GDTC', 'GV0128'), ('11A2', 'QPAN', 'GV0128'), ('11A2', 'HDTN', 'GV0114'), ('11A2', 'LY', 'GV0130'),
  ('11A2', 'HOA', 'GV0118'), ('11A2', 'SINH', 'GV0119'), ('11A2', 'TIN', 'GV0132'),
  ('11B1', 'TOAN', 'GV0123'), ('11B1', 'VAN', 'GV0124'), ('11B1', 'ANH', 'GV0115'), ('11B1', 'SU', 'GV0126'),
  ('11B1', 'DIA', 'GV0127'), ('11B1', 'GDTC', 'GV0129'), ('11B1', 'QPAN', 'GV0129'), ('11B1', 'HDTN', 'GV0115'),
  ('11B1', 'LY', 'GV0117'), ('11B1', 'HOA', 'GV0131'), ('11B1', 'SINH', 'GV0119'),
  ('11C1', 'TOAN', 'GV0122'), ('11C1', 'VAN', 'GV0114'), ('11C1', 'ANH', 'GV0121'), ('11C1', 'SU', 'GV0116'),
  ('11C1', 'DIA', 'GV0116'), ('11C1', 'KTPL', 'GV0126'), ('11C1', 'CN', 'GV0130'), ('11C1', 'TIN', 'GV0132'),
  ('11C1', 'GDTC', 'GV0129'), ('11C1', 'QPAN', 'GV0129'), ('11C1', 'HDTN', 'GV0116')
) AS v(class_name, subject_code, teacher_code)
JOIN tmp_mine m ON m.class_name = v.class_name
JOIN school_years sy ON sy.school_year_id = m.school_year_id
JOIN subjects s ON s.subject_code = v.subject_code
JOIN teachers t ON t.teacher_code = v.teacher_code
-- only subjects of the class type, and never on top of an existing assignment
WHERE EXISTS (SELECT 1 FROM track_subjects ts JOIN classes c ON c.class_id = m.class_id
              WHERE ts.track_id = c.track_id AND ts.school_year_id = c.school_year_id AND ts.subject_id = s.subject_id)
  AND NOT EXISTS (SELECT 1 FROM teaching_assignments a
                  WHERE a.class_id = m.class_id AND a.subject_id = s.subject_id AND a.deleted_at IS NULL);

-- Homeroom teacher joins all three class groups; subject teachers join the general group (as FE-03 does).
INSERT INTO group_members (group_id, user_id)
SELECT DISTINCT g.group_id, t.user_id
FROM tmp_mine m
JOIN groups g ON g.class_id = m.class_id AND g.deleted_at IS NULL
JOIN teachers t ON t.teacher_id = m.homeroom_teacher_id
              OR (g.group_type = 'GENERAL' AND t.teacher_id IN (SELECT a.teacher_id FROM teaching_assignments a
                                                                 WHERE a.class_id = m.class_id AND a.deleted_at IS NULL))
WHERE g.group_type IN ('GENERAL', 'STUDENT', 'PARENT')
  AND NOT EXISTS (SELECT 1 FROM group_members x WHERE x.group_id = g.group_id AND x.user_id = t.user_id);

-- New teachers join the school-wide teacher group.
INSERT INTO group_members (group_id, user_id)
SELECT g.group_id, t.user_id
FROM groups g CROSS JOIN teachers t
WHERE g.group_type = 'TEACHER_SCHOOL' AND g.deleted_at IS NULL AND t.teacher_code BETWEEN 'GV0113' AND 'GV0132'
  AND NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.group_id AND m.user_id = t.user_id);

COMMIT;

-- Check: classes of grades 11 and 12, homeroom teacher and number of subjects already assigned.
SELECT c.class_name AS lop, ct.track_name AS to_hop, u.full_name AS gvcn,
       (SELECT COUNT(*) FROM teaching_assignments a WHERE a.class_id = c.class_id AND a.deleted_at IS NULL) AS mon_da_phan_cong,
       (SELECT COUNT(*) FROM track_subjects ts WHERE ts.track_id = c.track_id AND ts.school_year_id = c.school_year_id) AS so_mon
FROM classes c
JOIN school_years sy ON sy.school_year_id = c.school_year_id AND sy.year_name = '2026-2027'
JOIN grade_levels gl ON gl.grade_level_id = c.grade_level_id AND gl.grade_level_name IN ('11', '12')
LEFT JOIN class_tracks ct ON ct.track_id = c.track_id
LEFT JOIN teachers t ON t.teacher_id = c.homeroom_teacher_id LEFT JOIN users u ON u.user_id = t.user_id
WHERE c.deleted_at IS NULL ORDER BY c.class_name;
