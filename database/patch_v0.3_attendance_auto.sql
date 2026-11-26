-- Approved by the team lead (Quoc) 26/11/2026 – run on the shared DB 26/11/2026.
-- FE-12 automatic filling of the later periods of a session (business rules §12 point 3, changed 26/11/2026):
-- when a period is saved, the later periods of the same class, day and session are saved automatically from it
-- (absent stays absent with its note, late becomes present). attendances.auto_from_slot_id marks such a row:
--   NULL      = recorded by a person (or by the first take of that period)
--   slot id   = filled automatically from that period; a later save of the source period updates it again.
-- A teacher who changes the student's status or note on the period clears it (the row becomes "by a person" and is
-- never overwritten again). Same definition as in educonnect_schema_v0.3.sql.
-- How to run: Supabase > SQL Editor > paste > Run (once; safe to run again).

BEGIN;

ALTER TABLE attendances ADD COLUMN IF NOT EXISTS auto_from_slot_id BIGINT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_attendances_auto_from_slot') THEN
    ALTER TABLE attendances
      ADD CONSTRAINT fk_attendances_auto_from_slot FOREIGN KEY (auto_from_slot_id) REFERENCES timetable_slots (timetable_slot_id);
  END IF;
END $$;

COMMIT;
