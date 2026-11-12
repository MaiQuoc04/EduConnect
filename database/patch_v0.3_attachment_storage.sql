-- Written by Anh (shared storage, feature/storage-supabase), 10/11/2026, waiting for the team lead (Quoc). Same
-- definition as in educonnect_schema_v0.3.sql.
-- Patch for a database already created from schema v0.3: attachments remember WHERE the file is stored, not only its
-- URL. The team chose Supabase Storage for images, videos and documents (09/11/2026; business rules §15 asked whether
-- attachments get a storage_key).
--   attachments.storage_key: path of the object inside its bucket, e.g. school-posts/2026/11/<uuid>.webp. Needed because
--     attachments go to a PRIVATE bucket: a link to a private file expires, so the server signs a fresh one from the key
--     each time the attachment is read; deleting the file later needs the key too.
--   attachments.bucket: name of the bucket that holds the object (e.g. attachments).
-- Both NULL-able: a file kept another way (the local disk driver used in development) has no bucket / key. The two
-- always go together: CHECK attachments_storage_key_bucket_check refuses a key without a bucket or a bucket without a
-- key. file_url stays NOT NULL: for a public bucket it is the real link; for a private bucket it is the unsigned object URL, kept
-- for reference only (never handed to a browser as is).
-- The table has no rows yet (nothing writes to it before this change): no data to move.
-- How to run: Supabase > SQL Editor > paste > Run (once; running it again changes nothing).

BEGIN;

ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS storage_key VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS bucket      VARCHAR(50)  NULL;

-- ADD CONSTRAINT has no IF NOT EXISTS: add it only when missing, so running the patch again changes nothing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'attachments'::regclass AND conname = 'attachments_storage_key_bucket_check') THEN
    ALTER TABLE attachments ADD CONSTRAINT attachments_storage_key_bucket_check
      CHECK ((storage_key IS NULL) = (bucket IS NULL));
  END IF;
END $$;

COMMIT;
