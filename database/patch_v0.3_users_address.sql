-- Patch for a database already created from schema v0.3 (28/10/2026): address moves from parents to users, so every
-- user can update their own address (UC-108). Same definition as in educonnect_schema_v0.3.sql.
-- How to run: Supabase > SQL Editor > paste > Run (once). Already run on the shared database on 28/10/2026; only
-- needed for another (local) database. After it, code must read / write users.address, never parents.address.

BEGIN;

ALTER TABLE users ADD COLUMN address VARCHAR(500) NULL;

-- Copy the existing parent addresses; moving data is not a profile edit, so updated_at stays as it was.
ALTER TABLE users DISABLE TRIGGER trg_users_updated_at;
UPDATE users u SET address = LEFT(p.address, 500)
FROM parents p
WHERE p.user_id = u.user_id AND p.address IS NOT NULL AND p.address <> '';
ALTER TABLE users ENABLE TRIGGER trg_users_updated_at;

ALTER TABLE parents DROP COLUMN address;

COMMIT;
