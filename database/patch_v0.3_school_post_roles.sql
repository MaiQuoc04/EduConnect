-- Written by Anh (FE-08 School Feed), 09/11/2026, waiting for the team lead (Quoc). Same definition as in
-- educonnect_schema_v0.3.sql.
-- Patch for a database already created from schema v0.3: school posts can be sent to some ROLES only (UC-60 / UC-61).
-- Today the audience is only grades and classes, so "Khối 10" reaches students, parents and teachers alike; the school
-- needs "parents of grade 10", "every teacher", "students of 11D1".
--   school_posts.target_roles: the roles that get the post, inside the grades / classes chosen (the two dimensions are
--   multiplied). NULL = every role, as before. Values: STUDENT, PARENT, TEACHER. School Managers always see every post
--   and the homeroom teacher of a targeted class always gets it (code, not the DB).
-- An array column, not a third join table: three fixed values, read together with the post row (no extra join in the
-- visibility query); the CHECK keeps the values valid.
-- Existing posts keep NULL = every role: no data to move, nothing changes for them.
-- The code on feature/fe-08-school-feed needs this patch: without the column every school feed screen fails.
-- How to run: Supabase > SQL Editor > paste > Run (once; running it again changes nothing).

BEGIN;

ALTER TABLE school_posts
  ADD COLUMN IF NOT EXISTS target_roles VARCHAR(20)[] NULL
    CHECK (target_roles <@ ARRAY['STUDENT', 'PARENT', 'TEACHER']::VARCHAR(20)[]);

COMMIT;
