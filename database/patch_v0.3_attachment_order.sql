-- Written by Anh (FE-08 School Feed), 17/11/2026. Same definition as in educonnect_schema_v0.3.sql.
-- Patch for a database already created from schema v0.3: the files of a post get an order chosen by the author.
--   attachments.sort_order: position of the file in its post / message, 0 = first. The first IMAGE in this order is
--     the picture of the post's card in the feed ("ảnh tiêu đề"). Written by FE-08 school posts (UC-60 create: the
--     order of the list sent; UC-61 edit: the author can reorder).
--   NULL = no order chosen: every row that exists today, and the rows FE-05 (group posts) and FE-06 (messages) still
--     write. The server sorts by sort_order NULLS LAST, then created_at, then attachment_id, so those rows keep the
--     order they have now (upload order).
-- No data to move, no index (a post has at most 10 files, read by post_id / school_post_id / message_id).
-- The server code that reads sort_order (utils/attachments.js) needs this column: run the patch BEFORE deploying it.
-- How to run (team lead): Supabase > SQL Editor > paste > Run. Once; running it again changes nothing.

BEGIN;

ALTER TABLE attachments ADD COLUMN IF NOT EXISTS sort_order SMALLINT NULL;

COMMIT;
