-- EduConnect patch v0.3: team leader + system messages (FE-04 teams / FE-06 chat, Khanh, approved by the lead 15/11/2026)
-- business-rules §4 "Teams in detail" and §6:
--   * a team (TEAM_CHAT) has one leader (groups.leader_id): the creator at first; any member may hand it over, and
--     the leader must hand it over before leaving while other members remain;
--   * system lines in a team chat: created, renamed, member left, member removed by a class change, leader changed.
-- Safe to run more than once. Existing database: run once in Supabase > SQL Editor. 51 tables (no new table).

BEGIN;

ALTER TABLE groups ADD COLUMN IF NOT EXISTS leader_id BIGINT NULL REFERENCES users(user_id); -- TEAM_CHAT only

-- Existing teams: the creator while still a member, else the member who joined first and is still in.
UPDATE groups g
SET leader_id = COALESCE(
      (SELECT g.created_by WHERE EXISTS (SELECT 1 FROM group_members m
                                         WHERE m.group_id = g.group_id AND m.user_id = g.created_by AND m.left_at IS NULL)),
      (SELECT m.user_id FROM group_members m
       WHERE m.group_id = g.group_id AND m.left_at IS NULL
       ORDER BY m.joined_at, m.member_id LIMIT 1))
WHERE g.group_type = 'TEAM_CHAT' AND g.deleted_at IS NULL AND g.leader_id IS NULL;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type VARCHAR(10) NOT NULL DEFAULT 'TEXT'; -- TEXT | SYSTEM
-- TEAM_CREATED | TEAM_RENAMED | MEMBER_LEFT | MEMBER_REMOVED | LEADER_CHANGED; content = the new name (TEAM_RENAMED)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS system_event VARCHAR(30) NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS target_user_id BIGINT NULL REFERENCES users(user_id); -- new leader

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_type_check') THEN
    ALTER TABLE messages ADD CONSTRAINT messages_type_check CHECK (message_type IN ('TEXT', 'SYSTEM'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_system_check') THEN
    ALTER TABLE messages ADD CONSTRAINT messages_system_check
      CHECK ((message_type = 'SYSTEM') = (system_event IS NOT NULL));
  END IF;
END $$;

COMMIT;
