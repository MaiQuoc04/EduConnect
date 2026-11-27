-- FE-09 Notifications (Quoc, 18/11/2026, approved by the lead the same day).
-- 28/11/2026: folded into educonnect_schema_v0.3.sql (column, primary key, foreign key, index, trigger). Run this patch
-- only on a database created from the schema file before that date; on a new database it is not needed (and would
-- fail on the existing foreign key).
--
-- 1. notification_recipients.role_code: the role a notification row is for. A user sees a notification only under
--    that ACTIVE role (business rules §9, FE-09 decisions); someone who is both teacher and parent of the same class
--    gets two rows, one per role, each read on its own. The primary key becomes (notification_id, user_id, role_code).
--    Rows written before this patch are filled once by the rules below (old test data); every new row carries the
--    role chosen by the code that sends it.
-- 2. Real time: an AFTER INSERT statement trigger calls pg_notify('notification_recipients', '<id>,<id>…') with the
--    new notification ids. PostgreSQL delivers NOTIFY only when the transaction COMMITs (nothing on ROLLBACK), so the
--    server (LISTEN, server/src/sockets/notificationListener.js) never announces a notification that does not exist.
--
-- RUN ORDER: together with the merge of FE-09 – after this patch every INSERT into notification_recipients must give
-- role_code (NOT NULL), so code from before FE-09 can no longer write notifications.

BEGIN;

ALTER TABLE notification_recipients ADD COLUMN IF NOT EXISTS role_code VARCHAR(50);

UPDATE notification_recipients r SET role_code = CASE
    WHEN (SELECT COUNT(*) FROM user_roles ur WHERE ur.user_id = r.user_id) = 1
      THEN (SELECT ro.role_code FROM user_roles ur JOIN roles ro ON ro.role_id = ur.role_id WHERE ur.user_id = r.user_id)
    WHEN r.student_id IS NOT NULL
      THEN CASE WHEN EXISTS (SELECT 1 FROM students s WHERE s.student_id = r.student_id AND s.user_id = r.user_id)
                THEN 'STUDENT' ELSE 'PARENT' END
    WHEN n.target_type = 'PASSWORD_RESET_REQUEST' AND EXISTS (
           SELECT 1 FROM user_roles ur JOIN roles ro ON ro.role_id = ur.role_id
           WHERE ur.user_id = r.user_id AND ro.role_code = 'SYSTEM_ADMIN') THEN 'SYSTEM_ADMIN'
    WHEN n.target_type IN ('PASSWORD_RESET_REQUEST', 'USER') THEN 'SCHOOL_MANAGER'
    WHEN n.type = 'CLASS_EVENT' THEN 'TEACHER'
    ELSE (SELECT ro.role_code FROM user_roles ur JOIN roles ro ON ro.role_id = ur.role_id
          WHERE ur.user_id = r.user_id AND ro.role_code <> 'SYSTEM_ADMIN'
          ORDER BY array_position(ARRAY['SCHOOL_MANAGER', 'TEACHER', 'PARENT', 'STUDENT'], ro.role_code::text) LIMIT 1)
  END
FROM notifications n
WHERE n.notification_id = r.notification_id AND r.role_code IS NULL;

-- A row whose user has no usable role left (should not happen): fall back to any role of the user.
UPDATE notification_recipients r SET role_code = (
  SELECT ro.role_code FROM user_roles ur JOIN roles ro ON ro.role_id = ur.role_id WHERE ur.user_id = r.user_id LIMIT 1)
WHERE r.role_code IS NULL;

ALTER TABLE notification_recipients
  ALTER COLUMN role_code SET NOT NULL,
  ADD CONSTRAINT fk_notification_recipients_role FOREIGN KEY (role_code) REFERENCES roles (role_code),
  DROP CONSTRAINT notification_recipients_pkey,
  ADD PRIMARY KEY (notification_id, user_id, role_code);

DROP INDEX IF EXISTS idx_notification_recipients_user_id_read_at;
CREATE INDEX IF NOT EXISTS idx_notification_recipients_user_role_read
  ON notification_recipients (user_id, role_code, read_at);

CREATE OR REPLACE FUNCTION notify_new_notification_recipients() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ids TEXT;
BEGIN
  SELECT string_agg(DISTINCT notification_id::text, ',') INTO ids FROM new_rows;
  IF ids IS NOT NULL THEN
    PERFORM pg_notify('notification_recipients', ids);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_notification_recipients_notify ON notification_recipients;
CREATE TRIGGER trg_notification_recipients_notify AFTER INSERT ON notification_recipients
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION notify_new_notification_recipients();

COMMIT;
