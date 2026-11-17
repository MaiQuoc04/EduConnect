-- EduConnect patch v0.3: client message id (FE-06 chat, Khanh; approved by the lead and run on the shared database
-- 17/11/2026). business-rules §6 "Sending":
--   * the chat shows a message at once (optimistic UI) and may send it again after a timeout or a lost connection;
--   * the client gives every message a random UUID (client_message_id); the same sender sending the same UUID again in
--     the same chat gets the message that was already saved – never a second copy.
-- Safe to run more than once. Existing database: run once in Supabase > SQL Editor. 51 tables (no new table).

BEGIN;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_message_id UUID NULL; -- NULL: system lines, older messages

CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_client_message_id
  ON messages (group_id, sender_id, client_message_id) WHERE client_message_id IS NOT NULL;

COMMIT;
