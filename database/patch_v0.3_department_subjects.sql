-- Patch for a database already created from schema v0.3 (07/11/2026, FE-03, agreed with the lead): each department
-- (tổ chuyên môn) owns a fixed set of subjects. School Manager renames departments and changes their subjects on the
-- Departments screen; on Update Teacher (UC-17) a teacher can only get subjects of their department or subjects that
-- belong to no department. A subject belongs to at most one department. Same definition as in
-- educonnect_schema_v0.3.sql. Hard delete allowed (a link row, like teacher_subjects).
-- How to run: ONLY after the lead approves. Supabase > SQL Editor > paste > Run (once; running it again changes
-- nothing). The last SELECT shows each department with its subjects.

BEGIN;

CREATE TABLE IF NOT EXISTS department_subjects (
  department_id BIGINT NOT NULL,
  subject_id    BIGINT NOT NULL,
  PRIMARY KEY (department_id, subject_id),
  UNIQUE (subject_id),                                   -- a subject belongs to at most one department
  FOREIGN KEY (department_id) REFERENCES departments(department_id),
  FOREIGN KEY (subject_id)    REFERENCES subjects(subject_id)
);
ALTER TABLE department_subjects ENABLE ROW LEVEL SECURITY;   -- like every table: only the Node server reads it

-- Start from the three departments of the school (business rules §4). Departments or subjects that do not exist on
-- this database are skipped; HĐTN (taught by homeroom teachers) stays in no department.
INSERT INTO department_subjects (department_id, subject_id)
SELECT d.department_id, s.subject_id
FROM (VALUES
  ('Tổ Toán – Khoa học tự nhiên',  ARRAY['TOAN', 'LY', 'HOA', 'SINH', 'TIN', 'CN']),
  ('Tổ Ngữ văn – Khoa học xã hội', ARRAY['VAN', 'SU', 'DIA', 'KTPL']),
  ('Tổ Ngoại ngữ – Thể chất',      ARRAY['ANH', 'GDTC', 'QPAN'])
) AS m(department_name, codes)
JOIN departments d ON d.department_name = m.department_name AND d.deleted_at IS NULL
JOIN subjects s    ON s.subject_code = ANY(m.codes) AND s.deleted_at IS NULL
ON CONFLICT DO NOTHING;

COMMIT;

SELECT d.department_name, string_agg(s.subject_name, ', ' ORDER BY s.subject_name) AS subjects
FROM departments d
LEFT JOIN department_subjects ds ON ds.department_id = d.department_id
LEFT JOIN subjects s ON s.subject_id = ds.subject_id
WHERE d.deleted_at IS NULL
GROUP BY d.department_name ORDER BY d.department_name;
