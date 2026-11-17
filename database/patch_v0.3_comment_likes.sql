-- Written by Anh (FE-08 School Feed), 17/11/2026. Same definition as in educonnect_schema_v0.3.sql.
-- Patch for a database already created from schema v0.3: a like can be given to a COMMENT, not only to a post
-- (FE-08 school feed comments; FE-05 group feed can use the same rows later).
--   post_likes.comment_id: the liked comment (comments.comment_id). NULL for a like of a post.
--   Each like row names exactly ONE target: post_id (group post), school_post_id (school post) or comment_id. The old
--     CHECK compared only the two post columns, so it is replaced by post_likes_target_check:
--     num_nonnulls(post_id, school_post_id, comment_id) = 1.
--   UNIQUE (user_id, comment_id): one like per person per comment, as UNIQUE (user_id, post_id) / (user_id,
--     school_post_id) do for posts (NULLs are distinct, so the post likes are not affected). The server's
--     INSERT … ON CONFLICT (user_id, comment_id) DO NOTHING needs it.
-- Unlike still HARD deletes the row (post_likes is in the hard-delete list, business rules §14). Deleting a comment is
-- a soft delete (deleted_at) and leaves its likes in place; nothing reads them while the comment is deleted.
-- No data to move: every existing row has post_id or school_post_id, so it passes the new CHECK.
-- How to run (team lead): Supabase > SQL Editor > paste > Run. Once; running it again changes nothing.

BEGIN;

ALTER TABLE post_likes ADD COLUMN IF NOT EXISTS comment_id BIGINT NULL;

-- ADD CONSTRAINT has no IF NOT EXISTS: every constraint is added only when missing, so a second run changes nothing.
DO $$
DECLARE
  old_check text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'post_likes'::regclass AND conname = 'post_likes_comment_id_fkey') THEN
    ALTER TABLE post_likes ADD CONSTRAINT post_likes_comment_id_fkey
      FOREIGN KEY (comment_id) REFERENCES comments(comment_id);
  END IF;

  -- The schema v0.3 CHECK has no name in the file (PostgreSQL called it post_likes_check): find it by what it checks,
  -- the two post columns and not comment_id, and drop it.
  FOR old_check IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'post_likes'::regclass AND contype = 'c' AND conname <> 'post_likes_target_check'
      AND pg_get_constraintdef(oid) LIKE '%post_id%' AND pg_get_constraintdef(oid) NOT LIKE '%comment_id%'
  LOOP
    EXECUTE format('ALTER TABLE post_likes DROP CONSTRAINT %I', old_check);
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'post_likes'::regclass AND conname = 'post_likes_target_check') THEN
    ALTER TABLE post_likes ADD CONSTRAINT post_likes_target_check
      CHECK (num_nonnulls(post_id, school_post_id, comment_id) = 1);
  END IF;

  -- Same name PostgreSQL gives the inline UNIQUE (user_id, comment_id) of the schema file.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'post_likes'::regclass AND conname = 'post_likes_user_id_comment_id_key') THEN
    ALTER TABLE post_likes ADD CONSTRAINT post_likes_user_id_comment_id_key UNIQUE (user_id, comment_id);
  END IF;
END $$;

COMMIT;
