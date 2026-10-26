-- 2026-10-26 – enable accent-insensitive search (PROPOSAL, waiting for the team lead's approval)
--
-- What:   installs the PostgreSQL extension "unaccent" (removes Vietnamese tone marks: unaccent('Phạm Gia Bảo')
--         = 'Pham Gia Bao', 'Đ' -> 'D').
-- Why:    school office staff often type names without accents ("Bao" must find "Bảo"). UC-07 View Student List
--         (FE-02) uses it when the extension exists and falls back to plain ILIKE when it does not, so the server
--         works before and after this file is run. Teacher / parent lists (UC-15, UC-105) can use it the same way.
-- Who:    the team lead (Quoc) runs it ONCE on the shared Supabase database: Supabase > SQL Editor > paste > Run.
--         Developers may also run it on their own local PostgreSQL (README §6). Restart the API server afterwards:
--         it checks for the extension once and caches the answer.
-- Where:  Supabase keeps extensions in the schema "extensions" (already present on Supabase and already in the
--         role's search_path). The CREATE SCHEMA line only matters on a local database, where that schema does not
--         exist yet; on Supabase it does nothing. The server finds the schema from pg_extension and calls
--         <schema>.unaccent(...), so it does not depend on search_path.
-- Undo:   DROP EXTENSION unaccent;  (nothing else depends on it)
--
-- Index: none, on purpose.
--   - Searches are "contains" (ILIKE '%bao%'); a leading wildcard cannot use a B-tree index anyway. It would need
--     pg_trgm + a GIN index on an IMMUTABLE wrapper around unaccent() (unaccent itself is only STABLE, so it cannot
--     be used in an index expression directly).
--   - One school = a few thousand users; a sequential scan of users takes well under a few milliseconds.
--   Revisit only if the users table grows by orders of magnitude.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- Check: should return 'Pham Gia Bao | Dang'
SELECT extensions.unaccent('Phạm Gia Bảo') || ' | ' || extensions.unaccent('Đặng') AS check_unaccent;
