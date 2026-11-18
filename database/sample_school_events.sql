-- Sample school calendar (Dung, 13/11/2026) – the holidays / anniversaries and the usual activities of a school year,
-- for the "Lịch của trường" screens. Run AFTER patch_v0.3_school_events.sql; on the shared DB only with the lead's OK.
-- Each date is placed in every school year of the database that contains it (a 2026-2027 year gets 20/10/2026 ...
-- 19/05/2027). A date outside every school year (e.g. 01/06, 27/07, 19/08, 02/09 when the year runs 05/09 – 31/05)
-- is skipped with a NOTICE. Safe to run again: a title already on that day is skipped. Created by the first active
-- School Manager. Remove: see the end of the file.

BEGIN;

DO $$
DECLARE
  tz CONSTANT text := 'Asia/Ho_Chi_Minh';
  manager bigint;
  y record;
  e record;
  d date;
  added int := 0;
  skipped text[] := '{}';
  v_title text;
  v_grade bigint;
BEGIN
  SELECT u.user_id INTO manager
  FROM users u JOIN user_roles ur ON ur.user_id = u.user_id JOIN roles r ON r.role_id = ur.role_id
  WHERE r.role_code = 'SCHOOL_MANAGER' AND u.status = 'ACTIVE' ORDER BY u.user_id LIMIT 1;
  IF manager IS NULL THEN RAISE EXCEPTION 'Không có tài khoản Ban giám hiệu (SCHOOL_MANAGER) đang hoạt động.'; END IF;

  FOR e IN
    SELECT * FROM (VALUES
      -- month, day, base year (anniversary number, NULL = none), title, start, end (same day / NULL),
      -- days (multi-day: end on day + n), grade ('12' = khối 12, NULL = toàn trường), location, description
      -- Ngày lễ, ngày kỷ niệm
      (1, 9, NULL::int, 'Ngày Học sinh – Sinh viên Việt Nam', '07:00', '09:00', 0, NULL, 'Sân trường',
       'Sinh hoạt dưới cờ về truyền thống học sinh – sinh viên; Đoàn trường tuyên dương học sinh tiêu biểu.'),
      (2, 3, 1930, 'năm Ngày thành lập Đảng Cộng sản Việt Nam (3/2/1930)', '07:00', '09:00', 0, NULL, 'Sân trường',
       'Chào cờ, sinh hoạt chủ đề về lịch sử Đảng; các lớp trang trí bảng tin chào mừng.'),
      (3, 8, NULL, 'Ngày Quốc tế Phụ nữ 8/3', '07:00', '09:00', 0, NULL, 'Sân trường',
       'Chúc mừng cô giáo, nữ nhân viên và các bạn nữ; các lớp tổ chức hoạt động tri ân.'),
      (3, 26, 1931, 'năm Ngày thành lập Đoàn TNCS Hồ Chí Minh (26/3/1931)', '07:00', '10:30', 0, NULL, 'Sân trường',
       'Mít tinh kỷ niệm, kết nạp đoàn viên mới, hội thao và trò chơi lớn theo chi đoàn.'),
      (4, 30, 1975, 'năm Ngày Giải phóng miền Nam, thống nhất đất nước (30/4/1975)', '07:00', NULL, 0, NULL, NULL,
       'Học sinh nghỉ lễ theo thông báo của nhà trường. Tuần trước đó các lớp sinh hoạt chủ đề.'),
      (5, 7, 1954, 'năm Chiến thắng Điện Biên Phủ (7/5/1954)', '07:00', '09:00', 0, NULL, 'Sân trường',
       'Sinh hoạt dưới cờ, kể chuyện lịch sử về chiến dịch Điện Biên Phủ.'),
      (5, 15, 1941, 'năm Ngày thành lập Đội TNTP Hồ Chí Minh (15/5/1941)', '07:00', '09:00', 0, NULL, 'Sân trường',
       'Sinh hoạt truyền thống Đội; Đoàn trường phối hợp với Liên đội các trường lân cận.'),
      (5, 19, 1890, 'năm Ngày sinh Chủ tịch Hồ Chí Minh (19/5/1890)', '07:00', '09:00', 0, NULL, 'Sân trường',
       'Chào cờ, dâng hoa, sinh hoạt chủ đề "Học tập và làm theo tư tưởng, đạo đức, phong cách Hồ Chí Minh".'),
      (6, 1, NULL, 'Ngày Quốc tế Thiếu nhi 1/6', '07:00', NULL, 0, NULL, NULL, 'Ngày Quốc tế Thiếu nhi.'),
      (7, 27, NULL, 'Ngày Thương binh – Liệt sĩ 27/7', '07:00', NULL, 0, NULL, NULL,
       'Đoàn trường tổ chức thăm, tặng quà gia đình chính sách và chăm sóc nghĩa trang liệt sĩ.'),
      (8, 19, NULL, 'Ngày Cách mạng tháng Tám thành công 19/8', '07:00', NULL, 0, NULL, NULL, 'Ngày Cách mạng tháng Tám thành công.'),
      (9, 2, 1945, 'năm Quốc khánh nước CHXHCN Việt Nam (2/9/1945)', '07:00', NULL, 0, NULL, NULL,
       'Học sinh nghỉ lễ Quốc khánh theo thông báo của nhà trường.'),
      (10, 20, NULL, 'Ngày thành lập Hội Liên hiệp Phụ nữ Việt Nam 20/10', '07:00', '09:00', 0, NULL, 'Sân trường',
       'Chúc mừng cô giáo, nữ nhân viên và các bạn nữ; thi cắm hoa giữa các lớp.'),
      (11, 20, NULL, 'Ngày Nhà giáo Việt Nam 20/11', '07:00', '10:00', 0, NULL, 'Sân trường',
       'Lễ kỷ niệm, tri ân thầy cô; văn nghệ chào mừng của các lớp. Học sinh mặc đồng phục.'),
      (12, 14, 1974, 'năm Ngày giải phóng Bù Đăng (14/12/1974)', '07:00', '09:00', 0, NULL, 'Sân trường',
       'Sinh hoạt dưới cờ về truyền thống quê hương Bù Đăng.'),
      (12, 22, 1944, 'năm Ngày thành lập Quân đội Nhân dân Việt Nam (22/12/1944)', '07:00', '09:00', 0, NULL, 'Sân trường',
       'Giao lưu với cựu chiến binh địa phương; sinh hoạt chủ đề "Uống nước nhớ nguồn".'),
      -- Hoạt động trong năm học (ngày thường lệ, nhà trường chỉnh lại theo kế hoạch thực tế)
      (9, 5, NULL, 'Lễ khai giảng năm học mới', '07:00', '09:30', 0, NULL, 'Sân trường',
       'Toàn trường dự lễ khai giảng. Học sinh có mặt lúc 6h30, mặc đồng phục.'),
      (9, 20, NULL, 'Họp phụ huynh học sinh đầu năm', '08:00', '10:00', 0, NULL, 'Các phòng học',
       'GVCN thông báo kế hoạch năm học, nội quy và bầu Ban đại diện cha mẹ học sinh lớp.'),
      (10, 26, NULL, 'Kiểm tra giữa học kỳ I', '07:00', '11:30', 4, NULL, 'Các phòng học',
       'Kiểm tra giữa kỳ các môn theo lịch của tổ chuyên môn (26/10 – 30/10).'),
      (1, 4, NULL, 'Kiểm tra cuối học kỳ I', '07:00', '11:30', 4, NULL, 'Các phòng học',
       'Kiểm tra cuối học kỳ I theo lịch thi chung của trường.'),
      (1, 16, NULL, 'Sơ kết học kỳ I', '07:00', '09:00', 0, NULL, 'Sân trường',
       'Tổng kết thi đua học kỳ I, khen thưởng tập thể và cá nhân.'),
      (3, 15, NULL, 'Kiểm tra giữa học kỳ II', '07:00', '11:30', 4, NULL, 'Các phòng học',
       'Kiểm tra giữa kỳ các môn theo lịch của tổ chuyên môn (15/3 – 19/3).'),
      (4, 20, NULL, 'Thi thử tốt nghiệp THPT', '07:00', '16:30', 1, '12', 'Các phòng thi khối 12',
       'Thi thử theo cấu trúc đề thi tốt nghiệp THPT; học sinh mang thẻ dự thi.'),
      (5, 3, NULL, 'Kiểm tra cuối học kỳ II', '07:00', '11:30', 4, NULL, 'Các phòng học',
       'Kiểm tra cuối năm theo lịch thi chung của trường.'),
      (5, 25, NULL, 'Lễ tổng kết năm học', '07:00', '09:30', 0, NULL, 'Sân trường',
       'Tổng kết năm học, khen thưởng học sinh giỏi, trao giấy khen; chia tay học sinh khối 12.')
    ) AS t(m, dd, base, title, s_hm, e_hm, days, grade, location, description)
  LOOP
    v_grade := NULL;
    IF e.grade IS NOT NULL THEN
      SELECT grade_level_id INTO v_grade FROM grade_levels WHERE grade_level_name = e.grade;
      IF v_grade IS NULL THEN RAISE NOTICE 'Bỏ qua "%": không có khối %.', e.title, e.grade; CONTINUE; END IF;
    END IF;
    d := NULL;
    FOR y IN SELECT school_year_id, start_date, end_date FROM school_years ORDER BY start_date LOOP
      FOR yr IN EXTRACT(YEAR FROM y.start_date)::int .. EXTRACT(YEAR FROM y.end_date)::int LOOP
        d := make_date(yr, e.m, e.dd);
        CONTINUE WHEN d < y.start_date OR d + e.days > y.end_date;
        v_title := CASE WHEN e.base IS NOT NULL THEN format('Kỷ niệm %s %s', yr - e.base, e.title) ELSE e.title END;
        IF EXISTS (SELECT 1 FROM school_events se WHERE se.deleted_at IS NULL AND se.title = v_title
                   AND (se.start_at AT TIME ZONE tz)::date = d) THEN
          CONTINUE;
        END IF;
        INSERT INTO school_events (school_year_id, grade_level_id, title, description, location, start_at, end_at, created_by)
        VALUES (y.school_year_id, v_grade, v_title, e.description, e.location,
                (d + e.s_hm::time) AT TIME ZONE tz,
                CASE WHEN e.e_hm IS NOT NULL THEN (d + e.days + e.e_hm::time) AT TIME ZONE tz END,
                manager);
        added := added + 1;
      END LOOP;
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM school_years y2 WHERE EXISTS (
          SELECT 1 FROM generate_series(EXTRACT(YEAR FROM y2.start_date)::int, EXTRACT(YEAR FROM y2.end_date)::int) g
          WHERE make_date(g, e.m, e.dd) BETWEEN y2.start_date AND y2.end_date - e.days)) THEN
      skipped := skipped || format('%s/%s %s', e.dd, e.m, regexp_replace(e.title, '^năm ', ''));
    END IF;
  END LOOP;
  RAISE NOTICE 'Đã thêm % sự kiện.', added;
  IF array_length(skipped, 1) > 0 THEN
    RAISE NOTICE 'Ngoài mọi năm học nên không thêm: %', array_to_string(skipped, '; ');
  END IF;
END $$;

COMMIT;

-- Check
SELECT to_char(se.start_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI') AS bat_dau,
       to_char(se.end_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') AS ket_thuc,
       COALESCE('Khối ' || gl.grade_level_name, 'Toàn trường') AS danh_cho, se.title AS su_kien
FROM school_events se LEFT JOIN grade_levels gl ON gl.grade_level_id = se.grade_level_id
WHERE se.deleted_at IS NULL ORDER BY se.start_at;

-- Remove the sample rows: every row inserted by one run shares its created_at (same transaction).
-- DELETE FROM school_events WHERE created_at IN (SELECT created_at FROM school_events
--   WHERE description IN ('Toàn trường dự lễ khai giảng. Học sinh có mặt lúc 6h30, mặc đồng phục.',
--                         'Lễ kỷ niệm, tri ân thầy cô; văn nghệ chào mừng của các lớp. Học sinh mặc đồng phục.',
--                         'Tổng kết năm học, khen thưởng học sinh giỏi, trao giấy khen; chia tay học sinh khối 12.'));
