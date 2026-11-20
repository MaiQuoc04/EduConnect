-- EduConnect patch v0.3: hide a conversation (FE-06 UC-132 Hide Conversation, Khanh 20/11/2026; business-rules §6
-- "Hiding a conversation"). Approved by the lead and run on the shared database 20/11/2026.
--   * a member of a 1-1 chat (DIRECT) or a team (TEAM_CHAT) can hide it from their own conversation list;
--   * hidden_at = when they hid it, on their active member row; NULL = never hidden or shown again (undo);
--   * the chat is hidden while nothing newer than hidden_at happened in it (a message from anyone, a delete for
--     everyone, a team system line); the server works this out when it reads the list, nothing is written on sending.
-- The class groups (GENERAL / STUDENT / PARENT) and the teacher group cannot be hidden.
-- Safe to run more than once. Existing database: run once in Supabase > SQL Editor. No new table.
-- Without the column the server still works: the list shows every chat and "Ẩn cuộc trò chuyện" answers that the
-- feature is not ready.

BEGIN;

ALTER TABLE group_members ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ NULL;

COMMIT;
