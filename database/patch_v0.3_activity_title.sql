-- FE-07 Extracurricular Event Management (Dung, 12/11/2026) – PROPOSED, waiting for the lead's approval.
-- An extracurricular activity needs a title (Stitch SCR-66 "Tên hoạt động", shown on the feed card, the list and the
-- notifications); posts have no title (business-rules §5) and extracurricular_events had none.
-- Adds extracurricular_events.title. Safe to run again. Run on the shared DB only after the lead approves.
BEGIN;

ALTER TABLE extracurricular_events ADD COLUMN IF NOT EXISTS title VARCHAR(255);
-- Rows created before this patch (none expected): use the start of the post text as the title.
UPDATE extracurricular_events ev SET title = left(split_part(btrim(p.content), E'\n', 1), 120)
FROM posts p WHERE p.post_id = ev.post_id AND ev.title IS NULL;
UPDATE extracurricular_events SET title = 'Hoạt động ngoại khoá' WHERE title IS NULL OR btrim(title) = '';
ALTER TABLE extracurricular_events ALTER COLUMN title SET NOT NULL;

COMMIT;

SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_name = 'extracurricular_events' AND column_name = 'title';
