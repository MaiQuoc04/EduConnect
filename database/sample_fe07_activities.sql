-- FE-07 sample activities (Dung, 12/11/2026) – demo data for the "Ngoại khoá" screens, one activity per state.
-- Run AFTER patch_v0.3_activity_title.sql, on a database that has the small seed (classes 10A1, 11D1 of 2026-2027).
-- On the shared DB only with the lead's OK (CLAUDE.md). Safe to run again: an activity whose title already exists in
-- the class is skipped. Times are relative to the moment you run it (Vietnam time), so the states stay correct:
--   10A1  Tham quan Bảo tàng Lịch sử Quốc gia        open, capacity 40, 1 registered
--         Workshop Robotics: lắp ráp xe tự hành        open, capacity 1, full
--         Trồng cây xanh quanh sân trường              deadline within 24 h, nobody registered (UC-69 reminder job)
--         Giải bóng đá giao hữu khối 10                deadline passed, 1 registered + 1 cancelled
--         Ngày hội đọc sách                            cancelled by the homeroom teacher
--         Hội trại truyền thống                        already took place, 2 registered
--   11D1  Tọa đàm hướng nghiệp: khối Kinh tế – Luật    open, no capacity, nobody registered (parent hanttn: two children)
--         Thăm Văn Miếu – Quốc Tử Giám                 post hidden on the class feed (teacher sees the "hidden" tag)
-- Registrations use the first studying students of the class that have a parent account (seed: baopg / toanpv,
-- khanglm / hanttn). No notifications are written: activities created on the screen send their own.
-- Remove: see the commented block at the end.

BEGIN;

DO $$
DECLARE
  tz CONSTANT text := 'Asia/Ho_Chi_Minh';
  today timestamp := date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh');  -- local midnight
  r record;
  cls record;
  kids bigint[];
  parents bigint[];
  v_post bigint;
  v_event bigint;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- class, title, location, description, start (days, hh:mm), end (days, hh:mm), deadline (days, hh:mm),
      -- capacity, status, posted (days ago), hidden, registrations: 'R' registered / 'C' cancelled per student
      ('10A1', 'Tham quan Bảo tàng Lịch sử Quốc gia', 'Bảo tàng Lịch sử Quốc gia, 1 Tràng Tiền, Hoàn Kiếm',
       E'Chuyến tham quan bổ trợ môn Lịch sử: xem trưng bày thời Lý – Trần và nghe thuyết minh về các cuộc kháng chiến.\nXe đưa đón tại cổng trường lúc 7h15. Học sinh mặc đồng phục, mang nước uống và sổ ghi chép.\nKinh phí vé và xe: 80.000 đồng/học sinh, nộp cho lớp trưởng.',
       10, '07:30', 10, '11:30', 5, '17:00', 40, 'OPEN', 2, false, 'R'),
      ('10A1', 'Workshop Robotics: lắp ráp xe tự hành', 'Phòng STEM, tầng 3 nhà B',
       E'Buổi thực hành cùng câu lạc bộ Robotics: lắp ráp và lập trình xe tự hành dò line.\nSố bộ kit có hạn nên chỉ nhận 1 học sinh của lớp đi cùng đội tuyển trường.',
       8, '14:00', 8, '16:30', 4, '17:00', 1, 'OPEN', 2, false, '-R'),
      ('10A1', 'Trồng cây xanh quanh sân trường', 'Sân sau nhà A',
       E'Hưởng ứng Tết trồng cây: mỗi nhóm 4 học sinh trồng và chăm một cây.\nNhà trường chuẩn bị cây giống và dụng cụ; học sinh mang găng tay và mũ.',
       3, '07:00', 3, '09:00', NULL, NULL, NULL, 'OPEN', 3, false, ''),
      ('10A1', 'Giải bóng đá giao hữu khối 10', 'Sân bóng nhân tạo của trường',
       E'Giải giao hữu giữa các lớp khối 10, thi đấu theo thể thức 7 người.\nHọc sinh đăng ký thi đấu mang giày đế bằng và tập trung trước 15 phút.',
       2, '15:00', 2, '17:30', -1, '17:00', NULL, 'OPEN', 6, false, 'RC'),
      ('10A1', 'Ngày hội đọc sách', 'Thư viện trường',
       E'Giao lưu cùng tác giả sách thiếu nhi và trao đổi sách cũ giữa các lớp.',
       6, '08:00', 6, '10:30', 3, '17:00', NULL, 'CANCELLED', 4, false, ''),
      ('10A1', 'Hội trại truyền thống', 'Khu dã ngoại Đồng Mô, Sơn Tây',
       E'Hội trại hai ngày một đêm: dựng trại, thi nấu ăn, lửa trại và các trò chơi lớn theo đội.',
       -25, '07:00', -24, '16:00', -28, '17:00', 45, 'OPEN', 32, false, 'RR'),
      ('11D1', 'Tọa đàm hướng nghiệp: khối Kinh tế – Luật', 'Hội trường tầng 1',
       E'Khách mời là giảng viên các trường đại học khối Kinh tế – Luật chia sẻ về ngành học, điểm chuẩn và cơ hội việc làm.\nPhụ huynh quan tâm có thể dự cùng con.',
       12, '08:00', 12, '10:30', 7, '20:00', NULL, 'OPEN', 1, false, ''),
      ('11D1', 'Thăm Văn Miếu – Quốc Tử Giám', '58 Quốc Tử Giám, Đống Đa',
       E'Tìm hiểu lịch sử giáo dục khoa cử và các bia tiến sĩ.',
       15, '08:00', 15, '11:00', 9, '17:00', 30, 'OPEN', 1, true, '')
    ) AS t(class_name, title, location, description, s_day, s_hm, e_day, e_hm, d_day, d_hm, capacity, status, posted,
           hidden, regs)
  LOOP
    SELECT c.class_id, c.homeroom_teacher_id, th.user_id AS teacher_user, g.group_id, y.end_date
      INTO cls
    FROM classes c
    JOIN school_years y ON y.school_year_id = c.school_year_id AND y.year_name = '2026-2027'
    JOIN teachers th ON th.teacher_id = c.homeroom_teacher_id
    JOIN groups g ON g.class_id = c.class_id AND g.group_type = 'GENERAL' AND g.deleted_at IS NULL
    WHERE c.class_name = r.class_name AND c.deleted_at IS NULL
    LIMIT 1;
    IF cls.class_id IS NULL THEN
      RAISE NOTICE 'Bỏ qua "%": không tìm thấy lớp % (2026-2027) có GVCN và bảng tin lớp.', r.title, r.class_name;
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM extracurricular_events ev JOIN posts p ON p.post_id = ev.post_id
               WHERE p.group_id = cls.group_id AND ev.title = r.title) THEN
      RAISE NOTICE 'Bỏ qua "%": lớp % đã có hoạt động này.', r.title, r.class_name;
      CONTINUE;
    END IF;

    INSERT INTO posts (group_id, author_id, content, approval_status, reviewed_by, reviewed_at, created_at,
                       is_hidden, hidden_by, hidden_at)
    VALUES (cls.group_id, cls.teacher_user, r.description, 'APPROVED', cls.teacher_user,
            now() - make_interval(days => r.posted), now() - make_interval(days => r.posted),
            r.hidden, CASE WHEN r.hidden THEN cls.teacher_user END, CASE WHEN r.hidden THEN now() END)
    RETURNING post_id INTO v_post;

    INSERT INTO extracurricular_events (post_id, title, location, start_at, end_at, registration_deadline, capacity,
                                        status, cancelled_at)
    VALUES (v_post, r.title, r.location,
            (today + make_interval(days => r.s_day) + r.s_hm::time) AT TIME ZONE tz,
            (today + make_interval(days => r.e_day) + r.e_hm::time) AT TIME ZONE tz,
            -- NULL deadline = "within the next 24 h": 20 hours from now, whole minutes (reminder job UC-69)
            COALESCE((today + make_interval(days => r.d_day) + r.d_hm::time) AT TIME ZONE tz,
                     date_trunc('minute', now()) + interval '20 hours'),
            r.capacity, r.status, CASE WHEN r.status = 'CANCELLED' THEN now() - interval '1 day' END)
    RETURNING event_id INTO v_event;

    -- First studying students of the class that have a parent account, with that parent.
    SELECT array_agg(student_id ORDER BY student_code), array_agg(parent_user ORDER BY student_code)
      INTO kids, parents
    FROM (
      SELECT DISTINCT ON (s.student_id) s.student_id, s.student_code, pu.user_id AS parent_user
      FROM class_enrollments ce
      JOIN students s ON s.student_id = ce.student_id
      JOIN student_parents sp ON sp.student_id = s.student_id
      JOIN parents pa ON pa.parent_id = sp.parent_id
      JOIN users pu ON pu.user_id = pa.user_id AND pu.status = 'ACTIVE'
      WHERE ce.class_id = cls.class_id AND ce.status = 'STUDYING'
      ORDER BY s.student_id, sp.relationship_type
    ) k;

    FOR i IN 1 .. least(length(r.regs), coalesce(array_length(kids, 1), 0)) LOOP
      CONTINUE WHEN substr(r.regs, i, 1) NOT IN ('R', 'C');
      INSERT INTO event_registrations (event_id, student_id, registered_by, status, registered_at, cancelled_at)
      VALUES (v_event, kids[i], parents[i],
              CASE substr(r.regs, i, 1) WHEN 'R' THEN 'REGISTERED' ELSE 'CANCELLED' END,
              now() - make_interval(days => r.posted) + interval '3 hours',
              CASE WHEN substr(r.regs, i, 1) = 'C' THEN now() - make_interval(days => r.posted) + interval '1 day' END);
    END LOOP;

    IF (today + make_interval(days => r.e_day))::date > cls.end_date THEN
      RAISE NOTICE '"%" rơi ra ngoài năm học (kết thúc %).', r.title, cls.end_date;
    END IF;
    RAISE NOTICE 'Đã thêm "%" – lớp %, event_id %.', r.title, r.class_name, v_event;
  END LOOP;
END $$;

COMMIT;

-- Check
SELECT c.class_name AS lop, ev.event_id, ev.title AS hoat_dong, ev.status, p.is_hidden AS an,
       to_char(ev.start_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') AS bat_dau,
       to_char(ev.registration_deadline AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') AS han_dang_ky,
       ev.capacity AS chi_tieu,
       (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = ev.event_id AND er.status = 'REGISTERED') AS da_dang_ky
FROM extracurricular_events ev
JOIN posts p ON p.post_id = ev.post_id
JOIN groups g ON g.group_id = p.group_id
JOIN classes c ON c.class_id = g.class_id
ORDER BY c.class_name, ev.start_at;

-- Remove the sample activities (only these titles; activities made on the screen are kept):
-- BEGIN;
-- CREATE TEMP TABLE fe07_sample ON COMMIT DROP AS
--   SELECT ev.event_id, ev.post_id FROM extracurricular_events ev WHERE ev.title IN (
--     'Tham quan Bảo tàng Lịch sử Quốc gia', 'Workshop Robotics: lắp ráp xe tự hành', 'Trồng cây xanh quanh sân trường',
--     'Giải bóng đá giao hữu khối 10', 'Ngày hội đọc sách', 'Hội trại truyền thống',
--     'Tọa đàm hướng nghiệp: khối Kinh tế – Luật', 'Thăm Văn Miếu – Quốc Tử Giám');
-- DELETE FROM notification_recipients WHERE notification_id IN (SELECT notification_id FROM notifications
--   WHERE target_type = 'EXTRACURRICULAR_EVENT' AND target_id IN (SELECT event_id FROM fe07_sample));
-- DELETE FROM notifications WHERE target_type = 'EXTRACURRICULAR_EVENT' AND target_id IN (SELECT event_id FROM fe07_sample);
-- DELETE FROM event_registrations WHERE event_id IN (SELECT event_id FROM fe07_sample);
-- DELETE FROM extracurricular_events WHERE event_id IN (SELECT event_id FROM fe07_sample);
-- DELETE FROM post_likes WHERE post_id IN (SELECT post_id FROM fe07_sample);
-- DELETE FROM comments WHERE post_id IN (SELECT post_id FROM fe07_sample);
-- DELETE FROM posts WHERE post_id IN (SELECT post_id FROM fe07_sample);
-- COMMIT;
