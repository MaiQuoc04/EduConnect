# EduConnect – guide for AI coding agents

EduConnect is a school communication and academic management web app for **one Vietnamese high school**
(capstone project SEP490-G39). Team: Quoc (lead), Anh, Dung, Khanh, Linh. **UI text is Vietnamese** (full
diacritics, calm tone, no exclamation marks – see the Stitch "Ink & Paper" design). Code, comments and API messages
stay in English; the client maps each API error `code` to Vietnamese in `client/src/messages.js`.

## Read before coding
1. `docs/business-rules.md` – **all agreed business rules**. They override any "usual" assumption. Never invent a
   rule; if something is not covered, stop and ask.
2. `docs/use-cases.md` – the 107 use cases (UC-01..UC-107) by feature. Reference UC IDs in code comments and PRs.
3. `docs/permissions.md` – who can do what, per role. Enforce it on the **server**.
4. `docs/screens.md` – the 71 screens.
5. `database/educonnect_schema_v0.2.sql` – the database (46 tables). Comments in the file explain each rule.

## Stack and commands
- `server/`: Node.js ≥ 20, Express 5 (ES modules), `mysql2/promise` (hand-written SQL, **no ORM**), JWT, Socket.io.
  - `npm run dev` (port 5000, `node --watch`), `npm run db:check`, `npm run seed:admin -- <user> "<name>" <password>`
- `client/`: React 19 + Vite + React Router 7 + axios. `npm run dev` (port 5173, proxies `/api` and `/socket.io`).
- Database: MySQL 8 (local 8.0.46 for experiments; shared Aiven MySQL 8.4 via SSL). Config in `server/.env`
  (see `.env.example`). **Never print, log, commit or hard-code secrets** (`.env`, `ca.pem`, passwords, JWT secret).

## Server structure (follow the `modules/auth` example)
```
server/src/
  config/      env.js (reads .env), db.js (pool, withTransaction)
  middlewares/ auth.js (requireAuth, requireRole), errorHandler.js
  utils/       AppError.js, settings.js (system_settings), activityLog.js
  modules/<feature>/  <feature>.routes.js -> .controller.js -> .service.js   (SQL lives in the service)
  sockets/     index.js (Socket.io, JWT auth, room "user:<id>")
  routes.js    mounts every module under /api/v1 (lists the owner of each FE)
```
- REST under `/api/v1`, plural nouns (`/students`, `/classes/:id/members`). JSON in camelCase; DB columns snake_case
  (alias in SQL: `full_name AS fullName`).
- Errors: `throw badRequest('MSGxx', 'Message')` etc. from `utils/AppError.js`; response shape is always
  `{ code, message, details? }`. Express 5 forwards errors from async handlers – no try/catch needed in routes.
- Validate input in the controller/service before touching the DB; use `?` placeholders only (no string-built SQL).
- Several writes that must succeed together (e.g. grade + grade history, post + attachments) → `withTransaction`.
- Log important actions with `logActivity` (list in business-rules §13).
- Push real-time events with `io.to(\`user:${id}\`)` / `io.to(\`group:${id}\`)`.

## Rules that are easy to get wrong
- **Soft delete everywhere**: no `DELETE` on business tables; `UPDATE ... SET deleted_at = NOW()`; every `SELECT`
  adds `deleted_at IS NULL`. Hard delete only: `post_likes`, `class_event_viewers`, `teacher_subjects`, `user_roles`,
  `student_parents`, expired OTPs.
- **Permissions use the active role** (`req.user.activeRole`), plus data scope: "homeroom teacher" = the teacher in
  `classes.homeroom_teacher_id`; teachers only see classes in their `teaching_assignments`; parents only their linked
  children (`student_parents`); students only themselves. `ProtectedRoute` on the client is only for navigation.
- System Admin never sees content (feeds, chats, grades, school posts). School Manager never sees class feeds/chats.
- Class events (FE-10) and extracurricular activities (FE-07) are different things and different tables.
- Grades: one row per score (`attempt_no`), averages computed not stored, finalized grade books are read only until
  SM unlocks, every change goes to `grade_histories`.
- Attendance: edit windows (23:59 same day / homeroom excused↔unexcused until semester closed / SM after) and every
  action goes to `attendance_histories`.
- Notifications: one `notifications` row + one `notification_recipients` row per recipient.
- Times: store with MySQL `NOW()`; compare times in SQL, not in JS.

## Client conventions
- Call the API only through `src/api/client.js` (adds the token, normalises errors to `{ code, message }`).
- Auth state and role switching: `src/context/AuthContext.jsx` (`useAuth()`).
- One folder per feature under `src/pages/<feature>/` when it grows; add routes in `App.jsx` wrapped in
  `ProtectedRoute roles={[...]}`.
- Styling: plain CSS with the tokens in `styles.css` ("Ink & Paper" purple ink, light background). Student / parent
  screens listed in `docs/screens.md` also need a mobile layout. No dashboard.

## Working rules for the agent
- Do not change scope, feature names, UC IDs, table or column names on your own. If the schema must change, propose
  the SQL change and wait for the team lead; schema changes go into `database/` first.
- Keep changes small and inside the feature you were asked about; do not refactor other members' modules.
- Mark anything you had to assume with `// ASSUMPTION:` and mention it in your summary.
- Before finishing: run the server and exercise the endpoint you changed; run `npm run build` in `client/` if you
  touched the client.
- Git: branch `feature/fe-xx-<short-name>` from `develop`, PR into `develop`. Never commit `.env` or `*.pem`.
