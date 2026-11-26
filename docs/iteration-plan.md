# Iteration plan – who builds what

Source: team decisions of 10/10 and 20/10/2026 (Report 2 v1.1, Project Tracking v1.2). Code due at the end of each
iteration. UC details: `docs/use-cases.md`; rules: `docs/business-rules.md`. Do not move work between iterations or
people on your own – ask the team lead (Quoc).

## How to use this file (for the agent)
- When asked "build my It1 work" or "build FE-xx", take the UC list below and build them **in this order**
  (UC order; a UC that depends on another one comes after it, e.g. "view list" before "update").
- Only build UCs of the feature you were asked about. If a UC needs data owned by another FE that is not built yet,
  use seed data or a minimal read-only query and mark it `// ASSUMPTION:`; do not build the other FE.
- One branch per FE: `feature/fe-xx-<short-name>` from `develop`.

## Summary

Code due dates: It1 30/10, It2 13/11, It3 **25/11 10:00** (moved from 27/11 on 24/11/2026 so that the Report 5 test
rounds finish before the reports are due at the end of 26/11 – see "Report 5 test schedule" under Current status).

| Iteration | Dates | Quoc | Anh | Dung | Khanh | Linh |
|---|---|---|---|---|---|---|
| Iteration 1 | 19/10 – 30/10/2026 | FE-01 | FE-02 | FE-03 | FE-04 | FE-13 |
| Iteration 2 | 02/11 – 13/11/2026 | review | FE-08, FE-14 | FE-10 timetable | FE-05, FE-06 | testing, integration |
| Iteration 3 | 16/11 – 25/11/2026 | FE-09, FE-12 | – | FE-10 calendar, FE-07 | – | FE-11 |

FE-10 is split: timetable in It2, class calendar in It3. It2 changed by the lead on 03/11/2026: Anh takes FE-08 School
Feed and FE-14 Parent Management (follows FE-02), Khanh takes FE-05 Group Feed and FE-06 Messaging (follow FE-04
groups; FE-06 moved back from It3). FE-05 and FE-08 are built separately; code they share (posts, comments,
reactions, attachments) is merged into one place after both are on `develop`.

## Current status (read first; update after every merge, schema patch or new decision)

- **FE-12 automatic filling of the later periods (26/11/2026, lead decision, Quoc; committed to `develop` 27/11,
  `e707d10`, after the R5 submission):** saving a period saves the later periods of the same class, day and session at once (absent stays
  with its note, late → present, a student not on the source list → present), per student up to the first later period
  where a person recorded that student; rows marked `attendances.auto_from_slot_id`; an unchanged save keeps them
  automatic, a change of status or note by a person clears it; history reason "Tự điền theo tiết N"; automatic rows
  notify nothing, a person's change on one says "… từ tiết N". Replaces the draft prefill of 23/11 (kept only for
  sessions without automatic rows, same copy rule). business-rules §12 point 3 rewritten.
  - **DB:** `patch_v0.3_attendance_auto.sql` (+ `educonnect_schema_v0.3.sql`) approved and **run on the shared DB
    26/11/2026** (column `auto_from_slot_id` BIGINT NULL + FK checked after the run; existing 11 rows untouched, all
    NULL = recorded by a person). Old server code ignores the column, so the code can be merged whenever ready.
  - Tested on the local DB (`auto.mjs`, 30 checks: the four lead cases, unchanged save, correction flowing on, stop at
    a person's row, note-only change, afternoon separate); server `npm test` 24/24, client build OK.
  - **FE-09 fix (26/11/2026, same working tree):** the child chips of SCR-04 showed the class of a school year that has
    not started (a student promoted early, UC-11: HS2602 "11A1" instead of 10A1; 8 students on the shared DB); the
    class is now that of the latest started school year, a future one only when there is no other.
  - **Reports owed (Quoc):** R3 BF-12 main steps, UC-90 normal flow / postconditions, SCR-56 notice, BR-40 / GBR on
    notifications; R4 II.1.2 explanation + sequence UC-90 (fillLaterPeriods step), I.3 attendances (new column);
    R5.1 UTC-ATT cases for the automatic filling.

- **Report 5 test schedule (decided 24/11/2026, lead):** reports R1–R7 are due at the **end of 26/11/2026**, so the
  last test round is run just before that and everything else is planned backwards from it. "Round" means a run of
  the whole set of Report 5 test cases (Round 2 and 3 re-run the failed cases plus the main flows after the fixes),
  not an iteration.

  | When | Work |
  |---|---|
  | 24/11 | Test plan 5.0 and the frames of 5.1–5.5 (done, on Drive) |
  | 24/11 evening – 25/11 10:00 | Everyone writes the test cases in their own sheets (FE for 5.1 / 5.2, BF for 5.3 / 5.5) |
  | **25/11 10:00** | **It3 code due (code freeze for testing):** after this only fixes of defects found by the test rounds are merged; a feature merged later gets N/A with a note |
  | 25/11 10:00 – 12:00 | Test case review (Quoc) |
  | 25/11 13:00 – 20:00 | Round 1: UT + IT on the local test DB, ST (BF-01..BF-12) and NFR (5.4) |
  | 25/11 20:00 – 26/11 08:00 | Fix the Critical / Major defects of Round 1 (feature owner) |
  | 26/11 08:00 – 12:00 | Round 2: failed cases + main flows again |
  | 26/11 13:00 – 17:00 | Round 3 (last round) + acceptance scripts SC-01..SC-12 |
  | 26/11 17:00 – end of day | Quoc fills 5.0 II.3 from the Test Statistics sheets; reports submitted |
  | Weeks 13–14 | Only revising and finishing Reports 6 and 7; no code or test changes |

- **FE-10 / FE-03 period limits replace the teacher norms (26/11/2026, Dung, `feature/fe-10-system-limits` on top of
  `feature/fe-10-timetable-quota`, merged into `develop` 27/11, merge `72ebd65`; changes business rules §10 – approved by
  the lead 27/11/2026 after the R5 submission because the business rules needed it; client build and server `npm test`
  (35/35) pass. Owed (Dung): one value for the legal cap of a class week – `timetable.constants.js` says the default 38
  is also the highest, the settings allow 7 × 6 = 42, business rules say 42; R3/R4/R5 parts on the norms and UC-133):** "Cài đặt hệ thống"
  (SCR-86) now has three school-wide values instead of the norms: most periods a teacher teaches a week (25), most
  periods a class has a day (7, Công văn 4567) and a week (38). New `school_settings` keys `teaching.teacher_max_week`,
  `teaching.class_max_day`, `teaching.class_max_week` (rows written on the first save, no schema change); the old
  rows `teaching.norm`, `teaching.homeroom_norm`, `teaching.max_over`, `teaching.max_periods_per_day` are no longer
  read (lead may soft-clean them later). Checked by automatic scheduling (weekly cap, grid day / week, `GRID_DAY_LIMIT`,
  `GRID_WEEK_LIMIT`; soft rules S1 and S4 removed; afternoon may now have up to 5 periods), every class timetable save
  (`MSG_TIMETABLE_CLASS_LIMIT`; editor and Excel import) and the teaching assignment SCR-19
  (`MSG_TEACHER_OVER_WEEK_LIMIT`). The timetable editor gets the class limits and refuses a period that breaks one
  when it is picked. FE-03 / FE-10 test cases about the norms (5.1–5.3) need updating (Dung).
  27/11/2026: built-in "nên dạy" 17 periods a week, homeroom teacher 13 (Thông tư 05/2025, not a setting) – warning
  only (auto scheduling loads / `OVER_NORM`, SCR-19 notice after saving).
  27/11/2026: a subject over its periods per week (`feature/fe-10-timetable-quota`) is now a warning only – editor
  warning + "Quay lại sửa / Vẫn lưu" on save, server returns `overQuota`, import shows it; class and teacher limits
  still block.

- **FE-10 periods per week enforced (26/11/2026, Dung, `feature/fe-10-timetable-quota`, merged with `feature/fe-10-system-limits`
  27/11, merge `72ebd65`; changes business rule §10 "shown but not enforced"):** a subject can no longer get more periods in a class
  timetable than its class type allows (`track_subjects.periods_per_week`). Server: `saveVersion` refuses the pattern
  with `MSG_TIMETABLE_OVER_QUOTA` (400, `details.items`), so the editor (UC-71 / UC-73), the Excel import (UC-72, the
  class is reported with the message) and the automatic scheduling apply are all covered; pure check in
  `timetable.quota.js` with unit tests (`timetable.quota.test.js`). Client (SCR-28 / SCR-30): picking a subject that
  already has its periods, or saving a pattern over the quota, opens a blocking dialog with one OK button; the server
  error opens the same dialog. Fewer periods are still allowed. Merged after Round 3, so FE-10 / BF-04 test cases
  need one more case each (Dung).

- **FE-13 / FE-02 fixes merged into `develop` (26/11/2026, Linh, `feature/fe-13-system-administration`, merge
  `822d3bc`; client `npm run build` and server `npm test` (24/24) pass):**
  - `ff65dda` (UC-103): the maintenance form with an end before the start returns `BEFORE_START` instead of a 500
    (the overlap check uses `GREATEST(start, end)` as the upper bound of `tstzrange`).
  - `21500d6` (UC-07, SCR student list, FE-02 page): every student is listed by default (students without a class
    this year first, then the classes); the "Chưa xếp lớp" checkbox became one more choice of the enrollment status
    select; the API takes `placement=ASSIGNED | UNASSIGNED` (the old `unassigned=true` still works); the search also
    matches the username. Merged after Round 3 (26/11 17:00), so the UC-07 test cases written for the checkbox need
    checking against the new select. Tell Anh (FE-02 owner). Left over: `.student-list-toggle` in `StudentListPage.css` is unused.

- **FE-08 `baaa3a5` merged into `develop` (25/11/2026, Quoc, merge `e6f8833`):** Anh's commit of 19/11 removes
  "Qua anh, chị, em" from linking a parent to a student (FE-02 page `UpdateStudentRelationshipPage`); only the phone
  lookup remains. Client only.

- **FE-04 SCR-70 periods message (26/11/2026, Khanh, on `feature/fe-05-group-feed`, merged into `develop` 26/11, merge
  `cef24c8`; merged after Round 3, so the UC-26 test cases may need the new messages):** a wrong
  "Số tiết/tuần" now shows its reason under the box (empty / not a whole number / 0 / above 10; an empty box only
  after leaving it or a save attempt), the column header shows "(1–10)", saving with wrong values names the subjects
  ("Còn n môn …") and focuses the first one, the footer total notes the rows it skips. Client only; the server rule
  (`MSG_TRACK_PERIODS_RANGE`, 1–10) is unchanged.

- **FE-10 School Manager settings + FE-07 fix merged into `develop` (24/11/2026, Quoc; client `npm run build` and
  server `npm test` (21/21) pass):**
  - `fix/fe-07-registration-list` (Dung, PR #16, merge `a9a5324`): UC-56 / UC-57 registration list and export no
    longer fail without a search (the accent parameters `$3` / `$4` are sent only with a search).
  - `feature/fe-10-school-settings` (Dung, PR #17, merge `8dbaec9`): School Manager "Cài đặt hệ thống" (`/school-settings`: teaching
    load of automatic scheduling + **attendance edit deadline**, so the FE-13 gap is closed), automatic scheduling
    draft edited by hand / teacher change in the cell editor / teacher load cards (details in Dung's entries below).
    Conflict in `client/src/navigation.js` resolved: FE-13's "Quản lý tài khoản" group kept, Dung's comment on
    "Quản trị hệ thống". FE-12 `attendance.scope.js` reads the deadline through `attendanceDeadline()` (2 lines, reviewed).
  - **DB:** `school_settings` on the shared DB (read-only check 24/11: the 4 `teaching.*` rows; no attendance row
    yet). `patch_v0.3_school_settings_attendance.sql` **still proposed, not run** – the app works without it
    (`school_settings` first, then the `system_settings` value 23:59; a School Manager save writes into
    `school_settings`).
  - **Open (lead):** approve / run that patch; Dung's `// ASSUMPTION:` earliest deadline 12:00.
  - **Numbers given (24/11/2026, lead):** UC-133 Configure School Settings, SCR-86 School Settings (use-cases.md,
    screens.md, permissions.md; SCR-85 Update Contact Information of FE-13 added to screens.md, it was only in R3).
    Owed (Dung): replace "id pending" in R3 10.1.11 and in the UC / screen lists, add the screenshot; add the
    `school_settings` table to R4 I.3 (56 tables). Owed (Linh): R4 I.2 lists 22 packages, now 23 (`school-settings`).
  - Still not merged: `feature/fe-08-school-feed` (`baaa3a5`, Anh, 19/11) – merged 25/11, `e6f8833`.

- **FE-13 merged into `develop` (24/11/2026, Quoc, `feature/fe-13-system-administration`, merge `a9c656e`;
  client `npm run build` and server `npm test` (21/21) pass; Linh's work of 22–24/11 below):** School Manager manages student / teacher / parent accounts, "Thêm vai trò", menu "Quản lý tài khoản",
  System Admin profile pages, settings changes. No schema change; `patch_v0.3_class_periods_settings_remove.sql`
  already run (read-only check 24/11: both `timetable.class_periods_*` rows gone). Scope checked on the server
  (`admin/scope.js`, `assertScope`): School Manager is refused on accounts with the SM / SA role, edits only email and
  phone, exports per type, never adds the SM role. Touches FE-02 / FE-03 / FE-14 pages (one import and a few lines
  each) – tell Anh and Dung. **Gap closed 24/11 by the FE-10 settings merge (above); before it** nobody could
  edit `attendance.edit_deadline_time` (FE-12 still reads it).

- **FE-13 roles: one role at creation, "Thêm vai trò" afterwards (24/11/2026, Linh, option 2; business rules §1,
  permissions 25):** SCR-61 has no role picker – an account is created with the role of its page, like an import row
  (`POST /admin/accounts` answers `ONE_ROLE` for two roles). New `POST /admin/accounts/:id/roles` adds a combinable role
  with its profile (teacher code + department; parent occupation + phone when missing), joins the school teacher group
  for Teacher / School Manager and logs `ROLE_CHANGE`; roles are never removed (no schema change). Button "Thêm vai trò"
  on SCR-60 (System Admin: Teacher, Parent, School Manager) and in the account card of the teacher / parent detail pages
  (School Manager: Teacher, Parent; not on accounts with the School Manager role, where the card now says why). Fixes
  the gap "a teacher created or imported earlier could never become a parent". Tested on the local DB (20 checks).
  No new use case: "Thêm vai trò" is part of UC-99 Update Account Information. SRS: UC list (UC-95, UC-99), UC-95 step 2, SCR-60, SCR-61, permission matrix, GBR-01.
- **FE-13 accounts for the School Manager (23/11/2026, Linh, supervisor's request; business rules §3, permissions 1, 20, 24):**
  School Manager creates, imports and exports student, teacher and parent accounts with FE-13's API and pages
  (`/admin/accounts` routes opened to SM with the scope checked in `admin/scope.js`): buttons on the student and parent
  lists (FE-02 / FE-14: "Xuất tài khoản", "Nhập từ file", "Thêm"), "Thêm giáo viên" on the teacher list (FE-03 keeps
  UC-115 / UC-116); card "Tài khoản đăng nhập" (email / phone edit, reset, lock) on the student and parent detail pages,
  email / phone edit added to the teacher card (shared `AccountSecurityActions`). Export per account type (columns of
  its import template + class / children + account columns). Changes in other members' files are one import and one
  line each, plus the hints that said email / phone are System Admin only. No schema change. **Tell Anh and Dung.**
- **FE-13 menu "Quản lý tài khoản" (23/11/2026, Linh):** the four account pages (Học sinh, Giáo viên, Phụ huynh, Quản lý
  nhà trường) form their own menu group; "Tài khoản người dùng" (list of every account) removed, `/admin/accounts`
  redirects to `/admin/students`, the System Admin home. Fifth page "Quản trị hệ thống" (`/admin/system-admins`): System
  Admin accounts listed, edited, locked / unlocked and reset like the others (as in Google Workspace, Moodle), never
  created there (`npm run seed:admin`, business rules §3); locking one's own account stays refused.
- **FE-13 "Cài đặt hệ thống" without the attendance deadline (23/11/2026, Linh):** `attendance.edit_deadline_time`
  is hidden from UC-102 (not listed, not editable by System Admin). No DB change: the row stays and FE-12 still reads
  it. **Follow-up owed (Dung):** edit it on the School Manager's settings page (`/school-settings`).
- **FE-13 settings `timetable.class_periods_min` / `_max` dropped (23/11/2026, Linh):** added 22/11 and removed the next
  day. **DB: `patch_v0.3_class_periods_settings_remove.sql` (deletes the 2 rows) – run on the shared DB 23/11 by Linh.**
- **FE-13 System Admin profile pages (22/11/2026, Linh, `feature/fe-13-system-administration`, merged into `develop` 24/11;
  supervisor's request):** menu "Hồ sơ học sinh", "Hồ sơ giáo viên", "Hồ sơ phụ huynh", "Quản lý nhà trường"
  (`/admin/students|teachers|parents|school-managers`): the UC-97 list with the role fixed, "Thêm" (UC-95, role fixed,
  other combinable roles can be added) and "Nhập từ file" (UC-96, type fixed). "Tài khoản người dùng" keeps the list
  of every account without create / import. UC-99 widened: `PUT /admin/accounts/:id` (was `/identifiers`) changes the
  username and the fields of the import file only. No schema change; FE-02 / FE-03 / FE-14 code untouched. SRS
  (UC-95, 96, 99, SCR-59, 61, 62, 76) to update.

- **Deploy config merged into `develop` (23/11/2026, Quoc, `chore/deploy-config` by Anh, merge `544f60e`; client
  `npm run build` and server `npm test` (21/21) pass on `develop`):** target Vercel (client) + VPS with nginx and pm2
  (server) + Supabase (DB and Storage); guide in `DEPLOY.md` (Vietnamese). Client reads `VITE_API_URL` /
  `VITE_SOCKET_URL` at build time (`api/client.js`, `SocketContext.jsx`; empty or unset = same origin through the
  Vite proxy, so development is unchanged), `client/.env.example`, `client/vercel.json` (SPA rewrite to
  `index.html`). Server: `trust proxy` `true` → `1` (one nginx hop, so clients cannot forge `req.ip` in
  `activity_logs`, §13). No schema change.
  - **Owed in `DEPLOY.md` (Anh):** §3.1 / §3.3 / §4 still say "PHẢI SỬA CODE" and quote the old code, though this
    branch already made those changes; it says Node listens only on `127.0.0.1`, but `server.listen(env.port)` listens
    on every interface (safe while `ufw` keeps port 5000 closed; fix the sentence or bind to `127.0.0.1` in
    production). At deploy time, check the shared DB for old `/uploads/...` URLs, which break once files are served
    from Supabase only.
  - Still not merged (23/11): `feature/fe-08-school-feed` (`baaa3a5`, 19/11), `feature/fe-10-school-settings`
    (`d474b16`, 23/11), `feature/fe-13-system-administration` (`f32bfbe`, 23/11), `fix/fe-07-registration-list`
    (`d0db83b`, 21/11).

- **FE-12 prefill merged into `develop` (23/11/2026, Quoc, `feature/fe-12-attendance`, merge `23e4d9f`; build and
  `npm test` pass on `develop`):** a period
  not taken yet opens prefilled from the nearest earlier taken period of the same day and session (statuses and
  notes copied as they are); the period is taken only when its teacher saves it (business rules §12 point 3). Server:
  `getSheet` returns `prefill` (`attendance.service.js`, `MORNING_LAST_PERIOD` in `attendance.constants.js`); client:
  `AttendanceSheet.jsx` drafts from it and shows "Đã điền sẵn theo tiết …". No schema change, notifications
  unchanged. Tested on the local DB: 15 API steps (no prefill for the first period of a session, nearest earlier
  taken period wins, late / notes copied as is, still "not taken" and in the SM's list until saved, afternoon never
  copies the morning, notifications as before). Client build passes.

- **FE-11 no overall average and no ranking (23/11/2026, Linh, `feature/fe-11-grade-management`, merged into
  `develop` 23/11; supervisor's request; business rules §11):** Circular 22 has no average of all subjects and does not compare students, so
  `overallAverage` / `rankStudents` are gone; each student gets an academic level Tốt / Khá / Đạt / Chưa đạt per
  semester and year (`academicLevel`, Article 9, unit tested). SCR-47 shows a "Kết quả học tập" column / boxes instead
  of "ĐTB chung" and "Hạng"; SCR-48 Class Ranking and its menu item removed (`/grades/ranking` redirects). No schema
  change. **Open:** subjects assessed by comments (Đạt / Chưa đạt), conduct and the titles Học sinh Giỏi / Xuất sắc
  need schema changes – to agree with the lead. SRS: UC-88, UC-89, SCR-47, SCR-48 to update.
- **FE-03 / FE-07 / FE-10 clean-up (24/11/2026, Dung, `fix/fe-10-calendar-one-class`, PR #18, merged into `develop` 25/11, merge `1928cdb`):** class calendar
  (UC-76): a student sees their own class, no "Tất cả lớp" picker (teachers and parents keep it); always-shown
  reminder notes removed from Dung's pages (calendar, timetable views / editor, period times, school settings,
  extracurricular form and registration list, teacher list, teaching assignment); duplicates removed: the teacher
  schedule lookup on SCR-19 (same as the weekly schedule on Teacher Detail, UC-16; endpoint
  `GET /timetables/teachers/:teacherId/week` removed) and the version list inside the timetable editor (the history page
  UC-124 stays, linked from the editor). No schema change. **Open (lead):** remove UC-125 from use-cases.md /
  permissions.md and the R3 SRS, or keep it pointing to Teacher Detail.
- **FE-10 automatic scheduling fix (25/11/2026, Dung, `fix/fe-10-auto-fixed-busy`, merged into `develop` 25/11, merge
  `e464504`; also removes the "Thông báo tự động" note from the class event form, SCR-40/42):** the HĐTN of the fixed cells
  (Chào cờ, Sinh hoạt lớp) no longer goes to a teacher who teaches a class outside the run at a fixed cell (found when
  re-taking the R3 screenshots: 12D1 got the teacher who has Chào cờ in 10A1, so its two fixed lessons could not be
  placed). Pre-check: teachers busy at a fixed cell are not counted for `FIXED_TEACHERS`; new blocking error
  `FIXED_TEACHER_BUSY` for a kept assignment. Solver unit tests added (`timetable.auto.solver.test.js`).
- **FE-10 School Manager settings (21/11/2026, Dung, `feature/fe-10-school-settings`, merged into `develop` 24/11):** new page
  "Cài đặt hệ thống" for the School Manager (`/school-settings`, menu "Quản trị hệ thống"; `GET` / `PUT
  /api/v1/school-settings`, module `server/src/modules/school-settings`). First group, moved from part "4. Giáo viên"
  of automatic scheduling (SCR-80): teacher norm, homeroom teacher norm, periods over the norm, periods a day.
  Automatic scheduling reads them on every run and apply (no longer in the request) and shows them read only; the
  busy teachers list stays on SCR-80. **DB: `patch_v0.3_school_settings.sql` (new table `school_settings`, 4 rows
  17 / 13 / 4 / 4) – approved by the lead, run on the shared DB 21/11 by Dung; 56 tables.** Schema file updated, so
  `scripts/dev-local-db.js` gets the table and its rows. Separate from `system_settings` (System Admin only, UC-102).
  **Owed:** UC / SCR id for the page (lead), use-cases.md / screens.md / permissions.md rows, SRS screen description.
- **Attendance deadline moved to the School Manager settings (24/11/2026, Dung, `feature/fe-10-school-settings`,
  not merged yet; PROPOSED):** "Giờ cuối giáo viên bộ môn được sửa điểm danh trong ngày" (`attendance.edit_deadline_time`,
  §12) is now edited by the School Manager in "Cài đặt hệ thống" (group "Điểm danh", time 12:00–23:59, default 23:59)
  instead of the System Admin. FE-12 `deadlineTime()` (`attendance.scope.js`, Quoc's module – one function changed)
  reads `school_settings` first, then the old `system_settings` row, then 23:59, so nothing changes before the patch.
  **DB: `patch_v0.3_school_settings_attendance.sql` (copies the value into `school_settings`, deletes the
  `system_settings` row so the SA screen stops showing it) – NOT run, waiting for the lead.** Schema file updated.
  Open: the earliest time 12:00 is an assumption; the SA page label for the key (Linh, `SystemSettingsPage.jsx`) can be
  removed after the patch.
- **FE-10 automatic scheduling: draft edited by hand before "Áp dụng" (21/11/2026, Dung, same branch, not merged
  yet):** on SCR-80 the School Manager can move a lesson (click or drag onto another cell of the class = swap), put
  another subject in a cell or leave it empty, and change the teacher of a class and subject (qualified teachers
  only in the list). Every change is checked again by `POST /api/v1/timetables/auto/check` (nothing saved;
  `timetable.auto.review.js`): the same hard rules as `/auto/apply` (errors block "Áp dụng") and the soft rules S1–S9 /
  GAP (warnings with their weights), each with its cell, shown on the grids and in "Cần chú ý"; undo and "Về bản
  gốc". `/auto/run` also returns this review, the subjects of each class and when each teacher is busy (other classes
  / marked). **No schema change.** `/auto/apply` unchanged (still re-checks everything).
- **FE-04 / FE-06 follow-ups merged into `develop` (21/11/2026, Quoc, `feature/fe-05-group-feed`, merge `7eb509b`;
  client `npm run build` and server `npm test` (20/20) pass on `develop`):** six commits of Khanh, 20–21/11.
  - **FE-04 class types per grade only** (UC-26, SCR-70, business rules §4): no more "every grade" type, tab and
    option "Mọi khối" removed, `createTrack` / `updateTrack` need a grade (`MSG_TRACK_GRADE_REQUIRED`), "Thêm loại
    lớp" hidden once the selected school year has grades. **DB: `patch_v0.3_class_track_split_all_grades.sql`
    (data only) – run on the shared DB 20/11 by Khanh** (each old every-grade type split into one per grade, new
    ids 33–40, subjects copied, classes moved). Read-only check 21/11: no active type without a grade.
  - **FE-06 unread badge** on "Trò chuyện" in the menu (`GET /conversations/unread-count`, `useChatUnread.js`).
  - **FE-06 UC-132 Hide Conversation** (proposed by Khanh, approved by the lead 20/11; business rules §6): a member
    hides a 1-1 chat or a team from their own list until something new happens in it; class groups and the teacher
    group cannot be hidden. **DB: `patch_v0.3_conversation_hidden.sql` (`group_members.hidden_at TIMESTAMPTZ NULL`)
    – run on the shared DB 20/11 by Khanh;** read-only check 21/11: column there, **55 tables**. Schema file updated,
    so `scripts/dev-local-db.js` gets the column.
  - **Follow-up owed (Khanh):** the small seed still creates "Khối A–D" with no grade
    (`educonnect_seed_small_v0.3.sql`, from `npm run seed:generate:small`), so a fresh local DB has every-grade types
    the new SCR-70 cannot show; the seed generator should give each type a grade (or `dev-local-db.js` should apply
    the split patch).
  - Not yet clicked through in a browser on `develop`. Still not merged: `feature/fe-08-school-feed` `baaa3a5` (see
    below).

- **FE-05 group feed comment likes and reports merged into `develop` (20/11/2026, Quoc,
  `feature/fe-05-group-feed`, merge `f55d990`; client `npm run build` and server `npm test` (20/20) pass on
  `develop`):** Khanh's 19/11 work (details under "Merged so far", 19/11 entry). **No schema change** (uses
  `comment_likes` / `comment_reports`, already on the shared DB). Comment-removed notifications go through Anh's
  `utils/commentReports.js` `notifyCommentRemoved`, which already writes `role_code` (FE-09), so it works on the
  shared DB. Shared code touched: `components/CommentThread.jsx` (hides "Báo cáo" only when a node has
  `canReport` false; FE-08 unchanged); business rules §5 and `permissions.md` updated. Use cases UC-129..UC-131 and
  screen SCR-84 "Báo cáo bình luận nhóm" (`groupfeed/GroupCommentReportsPage.jsx`) added by the lead 20/11. Not yet clicked through in a browser on
  `develop`. **Not merged yet:** `feature/fe-08-school-feed` has one new commit after its 18/11 merge (`baaa3a5`, Anh,
  19/11, "Bo lien ket phu huynh bang anh chi em" – removes linking a parent through a sibling), waiting for review.

- **FE-09 Notifications merged into `develop` (18/11/2026, Quoc, `feature/fe-09-notifications`, merge `fd1f42c`;
  build and `npm test` pass on `develop`):** UC-67..UC-69. **Everyone: pull `develop`** – since the patch, code
  without FE-09 cannot write notifications on the shared DB.
  - **DB: `patch_v0.3_notification_roles.sql` (approved by the lead 18/11) – run on the shared DB 18/11 by Quoc
    (481 old rows filled, none left without a role; PK, FK, index and trigger checked; a rolled-back insert sends no
    NOTIFY).** Adds
    `notification_recipients.role_code` (NOT NULL, FK roles, PK `(notification_id, user_id, role_code)`, old rows
    filled once by rule) and the statement trigger `trg_notification_recipients_notify` (`pg_notify` on commit).
    **Run it on the shared DB at the moment FE-09 is merged** – code without `role_code` can no longer write
    notifications afterwards; then everyone pulls `develop`. `scripts/dev-local-db.js` now applies it.
  - Server: `modules/notifications` (`/notifications`: list, unread count, read, read all, UC-68 `/sent`),
    `sockets/notificationListener.js` (LISTEN → `notification:new`), `notifications.jobs.js` (UC-69 hourly, env
    `REMINDER_JOB`), `config/db.js` exports `connectionConfig`, `config/env.js` `reminderJob`.
  - **Other members' code touched (one change each: the role of every recipient row; lead's OK 18/11):**
    `schoolposts.service.js` (Anh: `recipientsSql(..., { withRole })`), `utils/commentReports.js` (Anh: every role of
    the author but SA), `calendar.service.js` (Dung: `AUDIENCE_SQL` returns `role_code`; picked viewers get the roles
    they have in the class), `extracurricular.service.js` (Dung: PARENT / STUDENT), `maintenance.service.js` (Linh:
    one row per role), `accountControl.service.js` (Linh: SCHOOL_MANAGER). Mine: `auth.service.js`,
    `attendance.service.js`. Also (lead 18/11): `schoolposts.service.js` no longer notifies the author;
    `posts.service.js` (Khanh: calls in create / update / review – `notifyGroupPost` when a post comes onto the feed,
    `notifyPostPending` when it waits for approval, `notifyPostReviewed` on approve / reject) for the group feed
    notifications (`modules/notifications/groupPostNotifications.js`; new target types `POST_PENDING`, `POST_REVIEW`).
  - Client: bell in the top bar (`components/NotificationBell.jsx`), SCR-04 `/notifications`, UC-68
    `/notifications/sent` (teacher), menu "Thông báo" / "Thông báo đã gửi".
  - Tested on the local DB: 31 API steps (roles kept apart for a teacher who is also a parent, real-time push through
    LISTEN/NOTIFY, read per role, read all, reminder sent once, UC-68 list / detail / other teacher 404 / SM 403,
    deleted event hidden, maintenance per role). Server `npm test` and client `npm run build` pass. Not yet clicked
    through in a browser.

- **FE-12 Attendance merged into `develop` (18/11/2026, Quoc, `feature/fe-12-attendance`, merge `f90be11`; build and
  `npm test` pass on `develop`):** server
  `modules/attendance` mounted at `/attendances` (UC-90..UC-94: day view, sheet, save with the edit windows, history,
  class report + Excel, student / parent view, school statistics + periods not taken + Excel; personal ATTENDANCE
  notifications written straight into `notifications` + `notification_recipients`). Client `pages/attendance/`
  (SCR-56 / SCR-52 `/attendance`, SCR-53..55 `/attendance` for student / parent, SCR-51 `/attendance/stats`,
  `/attendance/students/:id`), menu section "Điểm danh", button "Điểm danh" in the teaching schedule lesson detail
  (Dung's SCR-57, one link). **No schema change.** Details agreed with the lead and the assumptions to confirm:
  business rules §12. Tested on the local DB: 63 API steps (scope, windows, deadline setting, homeroom switch, closed
  semester, SM entry of a missed period, notifications incl. a locked parent skipped, reports, statistics, exports);
  `npm test` and client `npm run build` pass. Not yet clicked through in a browser.
  Substitute check (local DB, 18/11): SM reassigns a (class, subject) for today only (UC-18) → its periods without
  attendance move to the new teacher, who can take them; the replaced teacher only views them (403
  `MSG_ATTENDANCE_VIEW_ONLY` on save); periods already taken stay with the teacher who took them (§10).
  Review 18/11 (lead): homeroom switch also ends with the school year; leave guard on the class attendance page;
  no stale-sheet check (§12 "Decided after the first review"). **Owed to FE-09:** a click on an ATTENDANCE
  notification (`target_type` ATTENDANCE, `target_id` = attendance_id, `student_id` set) must open `/attendance` on
  that child; no real-time push of attendance notifications yet.

- **Docs aligned with the code (18/11/2026, lead):** features already built without a use case got **UC-117..UC-128**
  (`use-cases.md`: switch role, post approval on/off, report / handle / like school post comments, period times,
  automatic scheduling, timetable history, teacher schedule lookup, manage / view school calendar, export grade book),
  pages without a screen number got **SCR-74..SCR-83** (`screens.md`; SCR-4 and SCR-51..56 marked planned until FE-09 /
  FE-12 are built) and `permissions.md` got the matching rows (notes 21–22). Existing UC / SCR numbers unchanged.
  Final reports R1–R7 due 26/11/2026; the drafts live on Drive (Project Reports), not in the repo.
- **20/11/2026 (lead):** the group feed comment likes and reports (FE-05, merged 19/11) got **UC-129..UC-131** and
  **SCR-84** Group Comment Reports; `permissions.md` rows reference them. Context diagram v2 drawn from the code
  (on Drive, folder Context Diagram).

Last updated: 18/11/2026 – three branches merged into `develop`, one merge each: FE-10 Schedule (Dung,
`feature/fe-10-class-calendar`: UC-70..UC-75 timetables, UC-76..UC-80 class calendar, school calendar, period times,
automatic scheduling, timetable history, teacher schedule lookup; it contains `feature/fe-10-timetable`, which needs no
merge of its own), FE-07 Extracurricular (Dung, UC-50..UC-57) and FE-08 follow-ups (Anh: comment likes, comment
reports, pin limit 3 for both feeds, attachment order and cover picture, drafts, closing item #3). Every feature
branch on the remote is now in `develop`. Patches `school_events`, `activity_title`, `attachment_order`,
`comment_likes`, `comment_reports` found on the shared DB (read-only check 18/11: **55 tables**). Build and
`npm test` pass after each merge.
Decided 18/11/2026 (lead, before FE-12): FE-12 Attendance is built before FE-09; why the homeroom teacher keeps
excused ↔ unexcused until the semester closes, and attendance notifications (student + parents, one per period,
on the first non-present take and every status change) – business rules §9 / §12. School feed (lead, 18/11): ANNOUNCEMENT shown
as "Bài đăng", two tabs Bài đăng / Tin tức without "Tất cả" (§8), and a post opens in a pop-up (OK for Anh's
`feature/fe-08-school-feed`, which already has the pop-up and the longer card text). **Owed:** the two tabs and the
"Bài đăng" wording on top of Anh's branch once it is merged (Quoc's first version was taken out of the FE-12 branch to
avoid a second pop-up); whether "Hiển thị thêm" shows the whole post or Anh's 1,000 characters + "Đọc toàn bài" is
still to settle with Anh.
Also 18/11, **merged into `develop`** (Anh, `feature/fe-08-school-feed`, merge `7b8a420`): the school feed follows the FE-05 group feed where
both use the shared `components/feed/` – post pop-up, longer card text from UC-58, shared `FeedKind` /
`FeedConfirmDialog` / `excerptOf`, label colour fix for both feeds. No schema change. The pop-up was
OK'd by the lead 18/11 (the SCR-05 page stays for notifications and old links); details under "Merged so far" and "Follow-ups owed".
Before: 17/11/2026 – FE-11 Grade Management (It3, Linh) merged into `develop` (UC-81..UC-89, no schema
change) and FE-13 follow-ups merged (setting `chat.delete_for_everyone_minutes` checked 1–1440, `utils/excel.js`
shared helpers, new Teachers / School Managers join the TEACHER_SCHOOL group). Linh's FE-11 assumptions accepted by
the lead and written into business rules §11 (rounding per Circular 22, students / parents see finalized books only,
export, multi-subject copy, `grade_components` hard delete §14); TEACHER_SCHOOL auto-join in §4.
Before: 11/11/2026 – FE-05 Group Feed, FE-08 School Feed, FE-14 Parent Management and the shared storage merged
(one merge of `feature/fe-05-group-feed`); FE-03 additions merged (UC-114..UC-116, assignments by date range); patches
`department_subjects`, `school_post_roles`, `attachment_storage` on the shared DB; videos 1–50 MB (lead, §13).
51 tables in `develop` (53 on the shared DB with FE-10), 116 use cases, 73 screens. It2 left: FE-10 timetable (Dung).
Notes from the FE-05 branch (Khanh, 11/11): FE-05 Group Feed started on `feature/fe-05-group-feed`, FE-08 branch merged into it to
reuse `feedInteractions.js` / `CommentThread.jsx`; lead agreed the FE-05 post-state rules, business rules §5:
rejected / hidden / unhide / edit back to pending / max 5 pins / approval switch / no SM approval in classes / 5,000
characters). FE-05 server done (`modules/posts`, UC-36..UC-46 + `PUT /groups/:groupId/post-approval`, signals
`post:changed` / `post:comment` / `post:comment-deleted` / `feed:settings`; new shared `utils/requestParsers.js`),
tested on the local DB. FE-05 client done: `pages/groupfeed/` (SCR-35 feed with tabs Bảng tin / Bài của tôi /
Chờ duyệt / Đã ẩn, SCR-36/38 one form, SCR-37 detail, mobile layout), approval switch on SCR-21 (`canSetApproval` on
GET /groups/:id). Two backward-compatible additions in FE-08 shared client code (Anh to confirm): `useLike(..., requests)`
and `CommentThread canWrite` (read-only comments). Not yet clicked through in a browser. Note: `dev-local-db.js` cannot start from a folder whose path has
accents (initdb fails on "Đồ Án"); copy `server/` + `database/` to an ASCII path to run it.
Before: 07/11/2026 (FE-06 Messaging merged with UC-110..UC-113, patch run on the shared DB; FE-13 departments
merged (It1 item #2 done); lead accepted Khanh's FE-06 decisions and assumptions (business rules §6) and the 1–1440
min range of `chat.delete_for_everyone_minutes`;
It2: Anh FE-08 + FE-14, Khanh FE-05 + FE-06).

- **Shared DB (Supabase):** schema v0.3 + `patch_v0.3_password_reset_requests.sql` (27/10) +
  `patch_v0.3_users_address.sql` (28/10: `users.address` added, `parents.address` dropped) +
  `patch_v0.3_reset_request_password.sql` (31/10: `password_reset_requests.temp_password_enc`) +
  `patch_v0.3_reset_cooldown_codes.sql` (01/11: reset cooldown setting, GV / HS codes padded to 4 digits) +
  `patch_v0.3_reset_request_delivery.sql` (01/11: `password_reset_requests.delivery`) +
  `patch_v0.3_departments.sql` (FE-03, already run before review; kept by the lead 02/11: table `departments`) +
  `patch_v0.3_class_track_grade.sql` (FE-04, run by Khanh 02/11 before approval; accepted 03/11:
  `class_tracks.grade_level_id`) +
  `patch_v0.3_message_actions.sql` (FE-06, run by Khanh 07/11 after the lead's OK: reply, delete, reactions) +
  `patch_v0.3_department_subjects.sql` (FE-03, run by Dung 11/11 after the lead's OK: table `department_subjects`
  with the starting list, business rules §4) +
  `patch_v0.3_school_post_roles.sql` (FE-08, Anh: column `school_posts.target_roles`) +
  `patch_v0.3_attachment_storage.sql` (storage, Anh: `attachments.storage_key` / `bucket` + check). Both checked on the
  shared DB by the lead 11/11 +
  `patch_v0.3_timetables.sql` (FE-10, run by Dung 11/11 after the lead's OK: tables `timetables` – version of a class
  timetable with its date range – and `timetable_entries` – weekly pattern). **53 tables** (with FE-10 merged;
  54 with the proposed `patch_v0.3_school_events.sql`).
  **+ `patch_v0.3_team_leader_system_messages.sql` (FE-04 / FE-06, run by Khanh 15/11 after the lead's OK):**
  `groups.leader_id` (the 5 active teams got their leader) and `messages.message_type` / `system_event` /
  `target_user_id` with two checks. **Code on `feature/fe-05-group-feed` needs it; branches without that code are
  not affected** (new columns only, with defaults).
  **+ found on the shared DB 18/11 (read-only check by the lead; the code merged 18/11 needs them):**
  `patch_v0.3_school_events.sql` (FE-10: table `school_events`), `patch_v0.3_activity_title.sql` (FE-07:
  `extracurricular_events.title`), `patch_v0.3_attachment_order.sql` (FE-08: `attachments.sort_order`),
  `patch_v0.3_comment_likes.sql` (FE-08: `post_likes.comment_id` + target check), `patch_v0.3_comment_reports.sql`
  (FE-08: table `comment_reports`). **55 tables** on the shared DB.
- **Sample data added to the shared DB (03/11, Anh, accepted by the lead 03/11), through the app API (UC-96, UC-14, UC-28),
  no SQL:** 90 student accounts `HS7001..HS7090` (no class yet), 90 parent accounts with phones
  `0977000001..0977000090` (all with `must_change_password`), 65 links (HS7001–7020 two parents, HS7021–7045 one,
  HS7046–7090 none; parents `0977000066..0977000090` not linked), 6 empty classes of 2027-2028 with their groups
  (10A1, 10A2, 10D1, 11A1, 11C1, 12A1). Accounts are never deleted (business rules §3): to remove the set, lock them
  or ask the lead; ids are in Anh's manifest file.
- **develop:**
  - FE-01 complete for It1 (merged 01/11): UC-01..UC-06, UC-107 Update Address, UC-108 Update Occupation,
    UC-109 View Child Profile, password reset request with sign-in name + full name check; forced password change
    after a temporary password asks only for the new password (01/11); the requests page lists emailed resets too
    ("sent by email" / "to hand over", 01/11).
  - FE-13 (Linh) merged 01/11 with the team lead's decisions applied: automatic reset from a request (email or
    SA / SM read the password), cooldown setting, role-based usernames, HS / GV + 4-digit codes, phone format,
    no SA creation from screens, settings ranges, UC numbers fixed. UC-95..UC-103 built; "View Activity Log"
    removed (log kept in the DB only).
  - FE-03 (Dung) merged 03/11: UC-15..UC-19 (teacher list / detail / update with the departments list, homeroom
    assignment, teaching assignment), all server code in `server/src/modules/teacher/`
    (`/teachers`, `/homeroom-assignments`, `/teaching-assignments`). Stray files removed at merge time.
  - FE-04 (Khanh) merged 03/11: UC-20..UC-35 (school years and semesters with reopen, subjects, class types per
    grade, create / import classes for students not in a class the previous year, groups, members, nickname, teams
    with leave), `syncClassTeachers` in `server/src/modules/classes/classGroups.js` (tested by the lead in a
    rolled-back transaction), all FE-04 screen numbers per `screens.md`.
  - FE-02 (Anh) merged 03/11: UC-07..UC-14 (student list / detail / update with address, transfer with reopening
    of an old enrollment, promotion with the next-year / grade / 45 / ended-year checks, parent links, UC-14 import),
    finished by the lead (see "FE-02 (Anh)" below). No schema change.
  - FE-13 (Linh) commit "select a specialized department/team" merged 07/11 (create / import accounts pick a
    department, `admin/departments.js`).
  - FE-03 additions (Dung) merged 11/11: UC-114 Manage Departments, UC-115 Export Teacher List, UC-116 Import
    Teachers, UC-18 teaching assignments by date range, teacher list / detail fixes (details in "FE-03 additions" below).
  - FE-06 (Khanh) merged 07/11: UC-47 Chat in Group, UC-48 View Conversation List, UC-49 Send Private Message,
    UC-110..UC-113 message actions, UC-35 teacher teams; module `server/src/modules/conversations/`, screens in
    `client/src/pages/chat/`. Needs `patch_v0.3_message_actions.sql` (run on the shared DB 07/11).
  - FE-05 Group Feed (Khanh), FE-08 School Feed + FE-14 Parent Management + shared storage (Anh) merged 11/11, all
    through `feature/fe-05-group-feed` (it contains `feature/fe-08-school-feed`, `feature/fe-14-parent-management`
    and `feature/storage-supabase`). Details below.
  - FE-11 Grade Management (Linh, It3) merged 17/11: UC-81..UC-89, module `server/src/modules/grades/` (mounted at
    `/grades`, unit tests with `npm test` in `server/`), screens in `client/src/pages/grades/` (SCR-25, SCR-44,
    SCR-47, SCR-48, SCR-68). Extras: grade book export to Excel, UC-82 copy to several subjects. No schema change.
  - FE-13 follow-ups (Linh) merged 17/11: `chat.delete_for_everyone_minutes` in the settings `RULES` (1–1440) and on
    the settings screen; account import / export use the shared `utils/excel.js` (`loadTemplateSheet`,
    `templateHeaderKey`, `workbookBuffer`); new Teacher / School Manager accounts join the TEACHER_SCHOOL group
    (`server/src/modules/admin/schoolGroup.js`, also used by UC-116).
  - FE-10 Schedule (Dung) merged 18/11 (`feature/fe-10-class-calendar`, contains `feature/fe-10-timetable`): module
    `server/src/modules/timetables/` and `calendar/`, screens SCR-27 / SCR-19 / SCR-39..42, school calendar
    `/school-events`, teacher schedule lookup for the School Manager. Also touches FE-03 (search for teachers on the
    teaching assignment screen, "Tra lịch dạy giáo viên" button). Sample files `sample_auto_schedule.sql`,
    `sample_grade_11_12.sql`, `sample_fill_assignments.sql`, `sample_school_events.sql` (demo only).
  - FE-07 Extracurricular (Dung) merged 18/11: UC-50..UC-57, `/extracurricular-events`, `pages/extracurricular/`, an
    activity card in the class feed (3 small FE-05 hooks in `posts.service.js`). Sample `sample_fe07_activities.sql`.
  - FE-08 follow-ups (Anh) merged 18/11: comment likes, comment reports (`/comment-reports`, menu "Báo cáo bình
    luận"), pin limit 3 (FE-05 too), attachment order and cover picture (`AttachmentPicker`, `setAttachmentOrder`),
    school post drafts, long posts cut with FE-05's `excerptOf`, closing item #3.
  - **18/11 (Anh, merged 18/11 `7b8a420`): school feed in line with the group feed** (only what both feeds share; nothing
    of FE-05's approval / hiding / "Bài của tôi", and nothing of FE-08 removed). Tested on the local DB with headless
    Chrome (1440 / 768 / 390 px), FE-05 and FE-06 checked again; `npm run build` passes.
    - Shared `components/feed/` (only additions, plus one colour fix): `excerptOf` moved here from
      `groupFeedShared.jsx`; `openOnClick` ignores a click that ends a text selection (FE-05's check); `FeedKind` (the
      frame of FE-05's `PostKind`, words passed in); `FeedConfirmDialog` (copy of FE-05's, plus `aria-describedby`);
      `FeedPostDialog` + `FeedPostDialogClose` (the shell of FE-05's `PostDialog`; Esc inside a nested dialog only
      closes that dialog); CSS `.feed-text` / `.feed-more` (FE-05's `.gf-more`; on a phone a 44px tap height without
      moving the text) and `.feed-post-dialog*` (copy of `.gf-post-dialog*`).
    - **Label colour fix (changes FE-05 too):** `.feed-kind` lost to `.label-upper` (styles.css is bundled after
      feed.css), so "THÔNG BÁO", "BÀI VIẾT" and "ĐÃ GHIM" were grey; now `.label-upper.feed-kind` is ink. The
      pending / rejected / hidden / news colours are unchanged. Also the label in FE-05's post form preview.
    - UC-58 `contentPreview`: the first **1,000** characters **with line breaks** (was 300, white space collapsed) +
      `contentTruncated`. "Hiển thị thêm" now opens up to 1,000 characters, then "Đọc toàn bài". ASSUMPTION: not the
      whole post as FE-05 (school posts have no length limit). Page of 10 long posts: 7.7 kB → 15.4 kB; short posts
      unchanged. The "Có nội dung mới" signature does not include the content, so it needs no change.
    - Post pop-up: a card opens the post over the feed (`?post=<id>` next to `q` / `tab` / `page`; Back closes it, a
      copied link opens it). `SchoolPostDetail.jsx` (content) is shared by the pop-up and the SCR-05 page
      (`SchoolPostDetailPage.jsx`, kept for notifications and old links). Room `schoolpost:<id>` joined while the
      pop-up is open; delete closes it; edit comes back to it; not found shows inside it. ASSUMPTION: the list is read
      again once when the pop-up closes (not after every like). A post saved on SCR-31 still opens on the SCR-05 page.
    - FE-08 own CSS now: search, pin colour and limit, news padding, the card text's white space, the audience line.
      `.sf-more` / `.sf-text` and the page's own `DeleteDialog` removed. Cards have `aria-label`.
  - **FE-05 attachments (12/11, Khanh; merged with `feature/fe-05-group-feed`).** Group posts take files like
    school posts: upload target `post` (folder `posts/`), `POST /groups/:groupId/posts` and `PATCH /posts/:postId`
    accept `attachments` (and `removeAttachmentIds` on edit), `GET /posts/attachment-limits`, posts carry
    `attachmentCount` / `firstImageUrl` in lists and `attachments` in the detail; deleting a post soft deletes its
    files; a change of files is an edit (§5: may go back to PENDING). ASSUMPTION: at most 10 files per post, as FE-08.
    New shared helpers in `utils/attachments.js` (`summarizeAttachments`, `readUploadedFiles`, `changeAttachments`:
    the FE-08 logic its comment proposed to share; FE-08 code untouched, Anh may switch to them) and
    `utils/requestParsers.js` (`uploadedFiles`, `idList`). Client: FE-08 `AttachmentPicker` / `AttachmentList` on
    SCR-36/38 and SCR-37, first picture + file count on SCR-35. Tested on the local DB with local storage (24 steps +
    the FE-05 suite); the browser → Supabase upload itself was not run (shared bucket).
    Also: **draft of a new group post** (client only, `pages/groupfeed/postDraft.js`): text + uploaded files saved in
    the browser's localStorage per account and group while typing, restored when the form opens again, removed when
    the post is sent or "Huỷ" → "Bỏ bản nháp"; the feed's composer says "Tiếp tục bản nháp". ASSUMPTION: kept 30 days.
    No schema change; a draft does not follow the user to another device.
  - **FE-06 chat attachments (12/11, Khanh; merged with `feature/fe-05-group-feed`).** Upload target `message`
    (folder `messages/<groupId>/`, only that chat's files accepted); `POST /conversations/:groupId/messages` takes
    `attachments`; a message may be files only (`messages.content` NULL, as the schema says); every message carries
    `attachments` (one query per page, links signed for one hour), quotes and the conversation list carry
    `attachmentCount`; a message deleted for everyone hides its files (§6). `GET /conversations/attachment-limits`.
    ASSUMPTION: at most 10 files per message. New shared helper `listAttachmentsOf` in `utils/attachments.js`. Client:
    📎 button and picture paste in the composer (FE-08 upload queue), files in the bubble (`pages/chat/MessageFiles.jsx`),
    expired links re-read per message; `ChatThread` is now keyed by group (a new chat starts with an empty composer).
    Tested on the local DB with local storage (17 steps + the FE-05 suites).
  - **14/11 (Khanh, not committed yet): one look for both feeds.** New shared `client/src/components/feed/`
    (`Feed.jsx`: FeedTabs, FeedSkeleton, FeedEmpty, FeedError, FeedPager, FeedCardImage, FeedPanel, NewContentPill,
    useNewContent, openOnClick; `feed.css`: `.feed-*` cards, tabs, side panels, states, pager, reading canvas
    `.feed-article*`), values taken from the FE-08 screens. FE-08 `SchoolFeedPage` / `SchoolPostDetailPage` now use it
    (same look; their CSS keeps only search, pin colour, news padding and the audience line) – checked by Anh 18/11:
    true until 17/11, then the long-post rules copied `.gf-more`; cleaned up 18/11 (see the 18/11 entry above).
    FE-05 rebuilt on it: cards with a kind line (Bài viết / Đã ghim / Chờ duyệt / Đã bị từ chối / Đã ẩn + left bar),
    pager (10 per page), "Có nội dung mới — Tải lại" pill, right column "Bài đã ghim" + "Duyệt bài"; SCR-37 as the
    school reading canvas with the actions at the top; SCR-36/38 in the school form shell (`SchoolPostForm.css`
    `.spf-*`) with a live preview; confirm dialogs in the `.sf-dialog` style.
  - **14/11 (Khanh, not committed yet): FE-05 pop-up and long posts.** A click on a card opens the post in a pop-up
    over the feed (`PostDialog.jsx`, address `?post=<id>`: Back closes it, a copied link opens it); the SCR-37 page
    stays for old links (both show `PostDetail.jsx`). Editing from the pop-up comes back to it. Cards cut posts after
    about 280 characters or 6 lines with "Hiển thị thêm" / "Ẩn bớt".
  - **15/11 (Khanh): team leader and system lines** (lead OK; business-rules §4 / §6, UC-35, permissions). Server:
    `groups/teamEvents.js` (system lines, leader hand-over when the system takes the leader out, real-time
    `message:new` / `group:changed` / `group:removed`), `teams.service.js` (leader on create, "đã tạo nhóm" line,
    `POST /groups/:id/leave { newLeaderId }` with 409 `MSG_TEAM_LEADER_MUST_TRANSFER`, `PUT /groups/:id/leader`,
    `PATCH /groups/:id` rename), chat API returns `type` / `event` / `targetName`, system lines cannot be answered /
    reacted to / deleted. `syncClassTeachers` (FE-04) and the transfer in `students.service.js` (**FE-02, Anh: one
    call added**) write "không còn trong nhóm" lines and hand the leadership over. Client: `groups/TeamActions.jsx`
    (rename, hand over, leave with the new-leader picker) on SCR-21 and in the chat header "⋮", "Trưởng nhóm" chip,
    system lines centred in the chat. Tested on the local DB (25 steps + the chat / feed suites).
  - **17/11 (Khanh): chat sending, drafts, connection** (business-rules §6 "Sending, drafts, connection"). Server:
    `clientMessageId` (no second copy when sent again; works without the column until the patch runs), NFC text,
    `GET /conversations/:id/messages?after=<id>`, `conversations/chatSignals.js` (`signalWhenSaved`: group:removed /
    group:changed / `chat:access-changed`, sent once the caller's transaction is saved) used by `syncClassTeachers`
    (class groups) and `teamEvents.afterRemovedFromTeams` (team lines and removals now in real time, the FE-02 call
    unchanged). Client: outbox with "Đang gửi…" / "Thử lại" / "Sửa" / "Xoá", ordered send queue, 15 s / 20 s
    timeouts (`NETWORK_TIMEOUT`), per-chat drafts (`chat/chatDraft.js`, "Bản nháp:" in the list), connection bar and
    catch-up on every socket `connect` (`useSocketStatus`), "↓ n tin nhắn mới", read only when the end is on screen.
    **DB: `patch_v0.3_message_client_id.sql` approved by the lead and run on the shared DB 17/11 (column + unique
    index checked; old messages keep NULL).** Tested on the
    local DB (17 new steps, with and without the column, + the del / act / files / team suites).
  - **17/11 (Khanh): group members** (business-rules §4, permissions, UC-32 / UC-33; Khanh's decision). Class groups:
    nobody removes anyone (403 `MSG_GROUP_MEMBER_CLASS_FIXED`), only the School Manager adds missing people of the
    class (the homeroom teacher no longer adds or removes). Teams: the leader adds (same class / teachers, active, up to
    50) and removes members through the same routes (`/groups/:id/candidates`, `POST|DELETE /groups/:id/members`),
    system lines `MEMBER_ADDED` / `MEMBER_KICKED`, real time (group:changed / group:removed). New flags
    `canAddMembers` / `canRemoveMembers`; adding and removing on the Members tab (SCR-22). No schema change. Tested on the
    local DB (28 steps + the team / chat suites).
  - **19/11 (Khanh; merged into `develop` 20/11, merge `f55d990`): group feed comment likes and reports, as the
    school feed** (business-rules §5, permissions;
    Khanh's decision). Server (FE-05, with Anh's shared `utils/feedInteractions.js` / `utils/commentReports.js`, no
    schema change): `PUT|DELETE /posts/:postId/comments/:commentId/like`, `POST …/report` (not the moderator: 403
    `MSG_MODERATOR_CANNOT_REPORT`; the moderator's own comments cannot be reported: 403 `MSG_CANNOT_REPORT_MODERATOR`, node
    `canReport` false, CommentThread hides the button – opt-in, FE-08 unchanged), comment list with `likeCount` / `likedByMe` / `reportedByMe`, `post.can.report`,
    deleting from the thread closes pending reports, `GET /group-comment-reports` + `PATCH …/:commentId { action }`
    (homeroom teacher: their class GENERAL feeds of open years; School Manager: the teacher group; `moderates` false
    for others), author notified on delete (`notifyCommentRemoved`, opens the post pop-up). Client: CommentThread gets
    `like` / `report`, new page `groupfeed/GroupCommentReportsPage.jsx` (same screen as FE-08's, menu "Báo cáo bình
    luận nhóm", teachers and School Manager). Tested on the local DB (33 steps + FE-05 suite + npm test).
  - **17/11 (Anh; merged into `develop` 18/11): comment reports** (FE-08 first, shared
    core for FE-05). Agreed before building: comments are still only deleted, never hidden (§5); the author of a
    deleted comment gets a notification written straight into `notifications` + `notification_recipients` (§9, FE-09
    not built yet); nobody learns who reported (no API returns a reporter's id or name, not even to the School Manager).
    - **DB: `patch_v0.3_comment_reports.sql` – found on the shared DB 18/11 (read-only check).** Table
      `comment_reports` (52 tables): `comment_id`, `reported_by`, `reason` (INAPPROPRIATE_LANGUAGE / HARASSMENT / SPAM /
      FALSE_INFORMATION / OTHER), `note` (≤ 500, needed for OTHER), `status` PENDING / RESOLVED / DISMISSED,
      `resolved_by` / `resolved_at`, `deleted_at`, UNIQUE `(comment_id, reported_by)`, RLS on. Tied to the comment, not
      the post, so FE-05 needs no schema change. Schema file updated. Runs twice without error.
    - Shared core `server/src/utils/commentReports.js` (data only, no permission check, like `feedInteractions.js`):
      `parseReportInput`, `reportComment`, `withReportedByMe`, `findReportedComment`, `listReports` (one item per
      comment with the report count, reasons, notes and the post; `source` SCHOOL_POST / GROUP_POST / ALL, `groupIds`
      required for group comments), `countPendingReports`, `resolvePendingReports`, `resolveReport` (DELETE = soft
      delete + every pending report RESOLVED, DISMISS = DISMISSED), `notifyCommentRemoved`.
    - FE-08 endpoints: `POST /school-posts/:id/comments/:commentId/report` (Teacher / Student / Parent within the
      post's audience, else 404; own comment 400 `MSG_CANNOT_REPORT_OWN_COMMENT`; deleted comment 404; reporting again
      200 and nothing changes; School Manager 403 – they delete directly, UC-66). `GET /comment-reports` and
      `PATCH /comment-reports/:commentId { action }`: School Manager only, **school post comments only** (§1: a group
      comment is 404 and never listed); a second decision 409 `MSG_REPORT_ALREADY_HANDLED`. DELETE sends the author a
      personal notification (`type` SCHOOL_POST, target the post, `is_personal` TRUE, names nobody) after COMMIT, plus
      `schoolpost:comment-deleted`. UC-66 delete now also closes the comment's pending reports.
    - Client: "Báo cáo" / "Đã báo cáo" in `CommentThread` only when the page passes `api.report` (FE-08 passes it except
      for a School Manager; FE-05 does not, so its threads are unchanged); dialog with reason + note. New screen
      `/comment-reports` (`pages/schoolfeed/CommentReportsPage.jsx`, menu "Báo cáo bình luận", School Manager only):
      tabs Chờ xử lý / Đã xoá bình luận / Đã bỏ qua, pager, "Xoá bình luận" with confirmation, "Bỏ qua".
    - Tested on the local DB: 64 API steps (permissions, audience 404, own comment, UNIQUE, three reporters → one item,
      delete / dismiss / notification text, group comment hidden from the School Manager, FE-08 / FE-05 / FE-06
      regressions) and 27 browser steps at 1440 / 768 / 390 px; `npm run build` passes.
    - Waiting for the lead: screen number (proposed **SCR-74 "Báo cáo bình luận"**), wording for business rules
      §5 / §8 / §9, the three new error codes (list below).
- **Not merged yet:** nothing (18/11: every feature branch on the remote is in `develop`).
  - FE-14 Parent Management (Anh, It2) – merged 11/11: UC-104 parent list, UC-105 parent detail with the linked
    children, UC-106 update profile (`fullName`, `occupation`, `address` only; login identifiers are not touched).
    Server `server/src/modules/parents/` (`GET /parents`, `GET /parents/:parentId`, `PATCH /parents/:parentId`,
    School Manager only). The UC-13 screen now uses `GET /parents`; the temporary `GET /students/parents/lookup`
    and `lookupParentByPhone` were removed 17/11 (closing item #3, merged 18/11).
  - FE-08 School Feed (Anh, It2) – merged 11/11: UC-58..UC-66 (all 9 UC), screens SCR-02 School Feed, SCR-05
    School Post Detail, SCR-31 Create School Post, SCR-06 Update School Post. The school feed is the home screen
    (`HOME_BY_ROLE`) and the first menu item of every role except System Admin. Layout per Stitch: three tabs
    Tất cả / Thông báo / Tin tức (changed 18/11 by the lead: two tabs Bài đăng / Tin tức, business rules §8); the "Lịch sắp tới của trường" column shows the FE-10 school calendar (Dung, 13/11).
    Comments are a tree (top-level newest first, replies oldest first; `utils/feedInteractions.js`
    `listComments`, shared with FE-05). Attachments: built 11/11 on the shared storage layer (Supabase Storage, UC-60..UC-62).
  - FE-08 real time (approved by the lead 09/11): room `schoolpost:<id>` (client sends `schoolpost:join` /
    `schoolpost:leave`, checked with UC-59's rule), events `schoolpost:comment` and `schoolpost:comment-deleted`
    (to the room) and `schoolpost:changed` (to `user:<id>` of every reader). Signals carry ids only; the client
    reloads through the API. No event for likes. Sent after COMMIT. Khanh's chat part of `sockets/index.js` is
    unchanged.
  - FE-08 role audience (approved by the lead 09/11): `school_posts.target_roles` (STUDENT / PARENT / TEACHER),
    multiplied with the grade / class targets; NULL = every role. In the code, the homeroom teacher of a targeted
    class or grade always gets the post (`homeroomMatchSql`, marked "Decision 2" in `schoolposts.service.js`). Needs `patch_v0.3_school_post_roles.sql` (run on the shared DB, see above).
- **FE-03 review (02/11):** endpoints work and the client builds. Lead decisions: keep the `departments` table;
  Dung's assumptions became business rules §4 "Teachers" (homeroom max 1 class per year, no new assignment for a
  locked teacher, assignments never back-dated, at least one subject per teacher, no empty pair while lessons
  remain); screen numbers are fixed by the lead after all It1 branches are merged.
- **FE-04 review (03/11):** lead decisions written into business rules §4 (school years, subjects, class types per
  grade with `grade_level_id`, every weight 1, classes max 45 students, UC-28 adds students without a class,
  nickname, teams: members picked at creation, anyone can leave, no admin; semester reopen; homeroom removes
  students / parents only; class group membership follows the class) and in UC-21 / UC-26 / UC-28 / UC-35.
- **FE-02 review (03/11):** UC-07..UC-13 built, UC-14 missing (built afterwards, see "Follow-ups owed"). Lead decisions in business rules §4 ("Who puts a
  student in a class", "Students") and §16 (search, name order): promotion is the only way for previous-year
  students, transfer same year and grade, create class / import only for students with no enrollment the previous
  year, no "drop out" use case (lock the account), SM edits a student's address, Anh's assumptions accepted, anyone
  coming back to a group gets the old row back. Shared accent-insensitive search `server/src/utils/search.js` (from
  Dung's helpers; FE-13 account list and FE-03 teacher list use it, 03/11).
- **FE-06 decision (04/11, changed the same day by Khanh; accepted by the lead 07/11):** business rules §4 are back to
  "anyone coming back sees the whole history", feed and chat; the earlier version (a member coming back sees only
  new messages) is dropped. Still in §6: a first-time member sees the chat only from when they joined. The chat counts
  from the earliest `joined_at` of all the person's rows in the group, because UC-32 adds someone back with a new
  row while FE-02 / FE-04 reopen the old one. `joined_at` is no longer reset, so FE-02 `joinClassGroups` needs no
  change. The group feed (FE-05) always shows its whole history.
- **Teacher teams (lead OK 05/11, Khanh; UC-35, business rules §4):** a teacher creates a team with no class from the
  teachers of the teacher group (filter by department). No schema change (`groups.class_id` is already nullable).
  `POST /groups/teams` takes `source: 'TEACHER_SCHOOL'`; `GET /groups` adds `teacherTeams`. Listed under "Toàn trường".
- **FE-06 message actions (lead OK 07/11, Khanh):** UC-110 Reply, UC-111 React, UC-112 Insert Emoji, UC-113 Delete
  Message (for everyone within `chat.delete_for_everyone_minutes`, default 15, or for me), business rules §4, §6,
  merged 07/11. Patch `database/patch_v0.3_message_actions.sql` (50 tables) ran on the shared DB 07/11.
  113 use cases. Moderator removal of other people's messages: not built (Khanh 07/11). Setting range 1–1440 min
  agreed by the lead 07/11 (business rules §13); the settings screen part is Linh's (see "Follow-ups owed").
  Chat screens show nobody's phone or email (Khanh 07/11, accepted by the lead 07/11).
- **FE-06 assumptions accepted by the lead 07/11 (Khanh, 04/11; now business rules §6, still marked
  `// ASSUMPTION:` in `server/src/modules/conversations/`):** Q1 two people no longer in reach (transfer, promotion, assignment ended):
  the old 1-1 chat stays readable, sending is closed (`MSG_DIRECT_OUT_OF_SCOPE`); Q2 locked accounts are not listed
  and cannot be written to (`MSG_DIRECT_LOCKED`), old chats stay readable; Q5 a message has at most 2000 characters;
  Q6 1-1 chats show full names, never the class nickname; Q7 who one may write to follows the active role; Q9 a
  teacher may also write to the teacher group members (teachers, School Managers); Q10 a 1-1 chat is listed under
  every role of its two members (not System Admin), sending is checked with the active role. Also: a 1-1
  chat is not listed for anyone until it has a message (Khanh, 05/11); Q3 (no `CHAT` notifications until FE-09) stays
  as proposed; Q4: messages cannot be edited, deleting follows UC-113 (lead OK 07/11). A student who transfers back
  to a class does not rejoin its teams
  automatically (only GENERAL + STUDENT), so the old team's chat stays closed to them; they can create a new team.
- **Numbering changes (01/11):** UC-104 View Activity Log and SCR-64 Activity Log removed; UC-105..UC-110 became
  UC-104..UC-109 and SCR-65..SCR-71 became SCR-64..SCR-70; then SCR-71 Password Reset Requests (FE-13) was added.
  109 use cases, 71 screens.
- **Use cases added after the plan:** UC-107 Update Address (User, 28/10), UC-108 Update Occupation (Parent, 29/10),
  UC-109 View Child Profile (Parent, 01/11), all FE-01 (Quoc, It1).
- **Closing It1 (lead, 04/11/2026).** Every It1 use case is on `develop` (FE-01, FE-02, FE-03, FE-04, FE-13) once
  `fix/it1-follow-ups` is merged. It1 is closed when the items below are done; they run alongside It2.

  | # | Work left from It1 | Owner | When |
  |---|---|---|---|
  | 1 | Merge `fix/it1-follow-ups` (FE-03 group sync, FE-03 screen numbers – details below) | Quoc | 04/11 |
  | 2 | FE-13 departments: create / import pick from the `departments` list (details below) | Linh | **done**, merged 07/11 (the follow-up patch is still open) |
  | 3 | Replace the temporary `GET /students/parents/lookup` with FE-14 UC-104 | Anh | **done**, merged 18/11: SCR-13 uses `GET /parents` since 11/11; route, `lookupParent`, `findParentByPhone` and the client's `lookupParentByPhone` removed, no error code left unused |
  | 4 | Shared Excel reading `utils/excel.js` for UC-96 / UC-14 / UC-27 (It2 clean-up, after the features merge) | Linh | It2 clean-up |
  | 5 | Decide: who adds a new department (SQL only today, or a screen for SM / SA) | Quoc | **decided 07/11**: School Manager, Departments screen (UC-114, FE-03, merged 11/11) |
  | 6 | Decide: the empty test school years on the shared DB (2025-2026, 2028-2029, 2030-2031; no classes; `school_years` has no `deleted_at`) – keep or remove | Quoc | 07/11 |
  | 7 | Decide: daily job to sync class groups when an assignment ends later (see "Open" below; proposal: FE-09, It3) | Quoc | before It3 |

- **FE-03 additions (Dung, 07/11, agreed with the lead; merged into `develop` 11/11):** UC-114 Manage Departments (`/departments`, SCR-72), UC-115 Export Teacher List
  (`GET /teachers/export`), UC-116 Import Teachers (`/teachers/import…`, SCR-73, reuses FE-13's
  `accountImport.service.js`), teaching assignments with start and end dates and history by range (UC-18,
  `GET /teaching-assignments?from=&to=`, `PUT` body `{ startDate, endDate }`; `date` is still read as the start).
  Rules in business rules §4 "Teachers". Touches FE-13 files (Linh, please review): `admin/departments.js`
  (department names compared with FE-03's `departmentKey`, so "Tổ Toán - Tin" typed with "-" matches "Tổ Toán – Tin")
  and `pages/admin/ImportAccountsPage.jsx` (optional `config` prop; System Admin page unchanged).
- **FE-10 class calendar (Dung, It3, started 10/11; merged 18/11):** server done in `server/src/modules/calendar/` (`/class-events`:
  list by range, detail, options, people of a class, create / update / delete; rules and ASSUMPTIONS in business rules
  §10). No schema change (tables already in v0.3). Screens SCR-39..42 built from the Stitch export 11/11 (`/calendar`, `/calendar/events/new`, `/calendar/events/:id`, `…/edit`, menu "Lịch lớp"). The 1-day reminder
  is `sendClassEventReminders()` (`calendar.reminders.js`): **FE-09 (Quoc) – please call it from the UC-69 job**.
  FE-07 (built on the FE-05 class feed) merged 18/11.
- **Follow-ups owed:**
  - **Linh – R3 / R4 after the FE-11 change (lead's review 23/11/2026):** 16 items (UC-89 / SCR-48 still listed,
    SCR-47 fields, UC-85 postconditions, GBR-31, new GBR-43, R4 package table and IV.4, one code comment) in
    `docs/report-fixes-fe11-linh.md`. Edit the Drive copies in "Nháp"; tick the items when done.
  - FE-08 school feed sync (18/11, Anh): pop-up **OK'd by the lead and merged**. Still owed on top of it (Quoc or
    Anh): two tabs Bài đăng / Tin tức without "Tất cả" and "Bài đăng" instead of "Thông báo" for ANNOUNCEMENT (§8);
    to settle with Anh: "Hiển thị thêm" = whole post or 1,000 characters + "Đọc toàn bài".
  - FE-05 (Khanh), after the FE-08 sync is merged – move to the shared `components/feed/` (no rush, nothing breaks
    meanwhile):
    - **Bug:** in `PostDialog`, Esc in the "Xoá bài?" / "Ẩn bài?" confirmation closes the pop-up too (its `onCancel`
      does not check `e.target === e.currentTarget`). Using `FeedPostDialog` fixes it.
    - `.gf-more` / `.gf-text` → `.feed-more` / `.feed-text` (note: `.gf-more` on a phone is 40px high, the shared
      one 44px).
    - Import `excerptOf` from `components/feed/Feed.jsx` and delete it from `groupFeedShared.jsx`.
    - `PostDialog` on `FeedPostDialog` + `FeedPostDialogClose`, then delete `.gf-post-dialog*` (keep the "⋮" menu
      rules of the pop-up in `GroupFeed.css`).
    - `PostKind` on `FeedKind`; `FeedConfirmDialog` from `Feed.jsx` with `quoteClassName="gf-dialog-quote"`.
    - Optional: the card click with the shared `openOnClick` (it now has the text-selection check).
  - After the 18/11 merges (lead): `client/src/messages.js` declares `MSG_INVALID_INPUT` and `MSG_SEMESTER_NOT_FOUND`
    twice (already on `develop` before 18/11; the second one wins) – keep one text each. Delete the remote branch
    `feature/fe-10-timetable` (fully inside `feature/fe-10-class-calendar`). Record who ran the five patches found on
    the shared DB 18/11.
  - FE-10 (Dung, It2): the timetable uses the date ranges of `teaching_assignments` – a period's teacher is the one
    whose assignment covers that date (no substitute teaching outside an assignment).
  - FE-13 (Linh): pull `develop` and continue from it; do not run SQL patches on the shared DB before the lead
    approves them.
  - **Done, merged 17/11.** FE-13 (Linh), after FE-06 (owed since 07/11): the setting `chat.delete_for_everyone_minutes` is listed on the
    settings screen with its English description and no check. (1) `server/src/modules/admin/settings.service.js`:
    add `'chat.delete_for_everyone_minutes': { type: 'int', min: 1, max: 1440 }` to `RULES` (business rules §13).
    (2) `client/src/pages/admin/SystemSettingsPage.jsx`: add it to `META` (group "Tin nhắn", label "Thời gian được thu
    hồi tin nhắn với mọi người", unit "phút"). Test on the local DB: set 1, send a message, after 1 minute "delete for
    everyone" is refused (`MSG_DELETE_EXPIRED`); 0, 2000 and "abc" are refused; a `SETTING_CHANGE` row is logged;
    `npm run build` passes. FE-06 already reads the value on every request (falls back to 15 if it is not a number).
  - FE-06 (Khanh), owed since the 07/11 merge: (1) chat attachments (business rules §5: images / files ≤ 10 MB,
    video ≤ 50 MB) are not built yet; they come with the upload code shared with FE-05 (see the FE-05 / FE-08 note
    at the top). (2) The `// ASSUMPTION:` comments in `server/src/modules/conversations/` still say "until the lead
    decides" / "to be confirmed"; reword them as accepted 07/11 (business rules §6).
  - FE-02 (Anh) – merged 03/11. The lead's list was done on the branch, all tested on the throw-away local DB
    (`dev-local-db.js`), nothing written to the shared DB:
    - Done: `develop` merged in. UC-09 edits the address (`users.address`, max 500, cleared when empty, as UC-107).
      Parent lookup uses `utils/phone.js`; the student list search uses `utils/search.js`; unaccent fallback and
      `database/2026-10-26_enable_unaccent.sql` deleted, root `package-lock.json` deleted. Class groups: coming back
      reopens the latest old row (`joinClassGroups`, used by UC-10 / UC-11 / UC-13 / UC-14). UC / SCR references
      fixed (UC-104 / UC-105, SCR-11). Promotion screen and Student List class filter use FE-04's `GET /school-years`
      and `GET /classes`; the temporary `GET /students/promote/options` is removed (the temporary parent lookup
      `GET /students/parents/lookup` stays until FE-14 UC-104 exists). Test students of `dev-local-db.js` now use
      `HS` + 4 digits (`HS9003..HS9017`).
    - Done: UC-14 Import Parent–Student Links. Server `students/parentLinkImport.service.js`:
      `GET /students/parent-links/template`, `POST /students/parent-links/preview`, `POST /students/parent-links/import`
      (School Manager only); preview and import check the same file with the same function, import locks the
      students and saves every valid row in one transaction. One link path with UC-13: `saveParentLinks` in
      `students.service.js` (it does not check the limits; UC-13 checks one link, UC-14 the whole file in row order).
      Client: page `/students/parent-links/import` (SCR-07 button), same wizard as FE-13's Import Accounts, plus a
      confirmation dialog and the student / parent names on every row.
    - Tests passed: every UC-14 case of the lead's list (valid file, mixed file, unknown code / phone, phone of a
      non-parent account, wrong relationship, link exists, third parent, same pair twice, `+84 905 000 041`, no
      valid row, 501 rows, file not from the template), plus preview = import row by row, cumulative 2-parent count,
      preview writes nothing, rollback on a forced error, old group rows reopened, UC-13 unchanged, 403 for teacher /
      student / parent / SA and 401 without a token. UC-09 address set / cleared; parent lookup `+84…`, `0905.000.041`
      found, 11 digits invalid; "bao" finds "Bảo", "%" matches only a literal %. Client: `npm run build` passes; UI
      checked at 1440 / 768 / 390 px.
    - Lead decisions on Anh's questions (03/11), done by the lead on the branch:
      - Sample data on the shared DB accepted (see "Sample data" above).
      - Transfer back to a class already studied in that year **reopens the old enrollment** (`STUDYING`, `left_at`
        cleared, its grades and attendance come back); `UNIQUE (student_id, class_id)` stays, no schema change;
        `MSG_CLASS_ALREADY_ENROLLED` removed. The transfer screen lets such a class be picked ("đã từng học").
      - Now enforced (business rules §4): UC-11 only from the school year right before the destination
        (`MSG_NOT_NEXT_SCHOOL_YEAR`), destination not ended (`MSG_SCHOOL_YEAR_ENDED`), next or same grade
        (`SKIP_GRADE_NOT_ALLOWED`, per student), target class max 45 (`MSG_CLASS_FULL`, whole call refused); UC-10
        refuses an ended year and a full class. FE-04's `lockOpenYear`, `MAX_CLASS_SIZE` and `previousYearSql` are
        reused.
      - FE-02 error codes moved into `client/src/messages.js`; the pages keep only texts that depend on the screen
        (`MSG_INVALID_PARAM`, `WARN_*`, UC-14 row texts). The link page's phone check is `0` + 9 digits like
        `utils/phone.js`.
      - UC-14 `// ASSUMPTION:`s accepted. Moving UC-96's file reading into `utils/excel.js` waits until the It2
        clean-up (shared code is merged after the features are on `develop`).
      - Tested by the lead on the shared DB inside rolled-back transactions (nothing kept): transfer A → B → A
        reopens the same enrollment and its group rows, one `STUDYING` row; full class and ended year refused for
        UC-10 / UC-11; UC-11 from a year that is not the one right before refused; 10 → 11 and 10 → 10 promoted,
        10 → 12 skipped; plus the API checks (401 / 403, list search, parent lookup, UC-14 template / preview,
        link path). `npm run build` passes.
    - Left after the merge: FE-14 (Anh) replaces the temporary `GET /students/parents/lookup` with UC-104 (done
      17/11, closing item #3); the `utils/excel.js` clean-up with FE-13 in It2 (done, merged 17/11).
  - FE-14 (Anh, It2 since 03/11): uses UC-104..UC-106; a parent's address is `users.address`, occupation stays
    `parents.occupation`.
  - FE-08 / FE-14 (Anh), owed since 09/11 (both merged 11/11):
    - Done 17/11, merged 18/11 (closing item #3): the temporary `GET /students/parents/lookup` (`students.routes.js`,
      `lookupParent` in `students.controller.js`, `findParentByPhone` in `students.service.js`) and the client's
      `lookupParentByPhone` removed. Tested on the local DB: the old route gives 404; SCR-13 phone lookup through
      `GET /parents` (10 digits, +84, dots) still shows the parent's name before linking; UC-12 / UC-13 / UC-14 and
      FE-14 unchanged (regression suite 215/215); `npm run build` passes.
    - Error codes not in `client/src/messages.js` yet, waiting for the lead's OK (checked in the code 09/11; the
      pages keep their own texts meanwhile):
      - FE-08: `MSG_AUDIENCE_REQUIRED`, `MSG_CANNOT_PIN_NEWS`, `MSG_CANNOT_REACT_NEWS`, `MSG_CANNOT_COMMENT_NEWS`,
        `MSG_SCHOOL_POST_NOT_FOUND`, `MSG_GRADE_NOT_FOUND`, `MSG_COMMENT_NOT_FOUND`, `MSG_INVALID_PARENT_COMMENT`,
        `MSG_PARENT_COMMENT_DELETED`, `MSG_FIELD_NOT_EDITABLE`, `MSG_NO_FIELDS_TO_UPDATE`; comment reports (17/11):
        `MSG_CANNOT_REPORT_OWN_COMMENT`, `MSG_REPORT_ALREADY_HANDLED`, `MSG_REPORT_NOT_FOUND`.
      - FE-14: `MSG_FIELD_NOT_EDITABLE`, `MSG_NO_FIELDS_TO_UPDATE` (also thrown by FE-02 UC-09).
      - `MSG_INVALID_PARAM` (both) stays a screen text, as for FE-02.
    - `CLAUDE.md` says to push with ``io.to(`group:${id}`)``, but `sockets/index.js` has no `group:<id>` room: only
      `user:<id>` (joined automatically) and, since FE-08, `schoolpost:<id>` (joined by the client).
    - Import cycle `sockets/index.js` ↔ `schoolposts.service.js` (the socket imports `assertCanSeeSchoolPost`, the
      service imports `emitToUsers` / `emitToSchoolPost`). It works (both are only used at run time), but Khanh
      should know before adding top-level code to `sockets/index.js`.
    - It2 clean-up (with closing item #4): `TARGETABLE_ROLES` is declared twice (`schoolposts.service.js` and
      `client/src/pages/schoolfeed/schoolFeedShared.jsx`); `client/src/pages/schoolfeed/leaveGuard.jsx` is a copy of
      the `useLeaveGuard` in `pages/students/UpdateStudentPage.jsx`; the query checks `optionalString`,
      `optionalInt`, `optionalEnum`, `rejectUnknownKeys` are copied from `students.controller.js` into
      `parents.controller.js`.
    - Khanh (FE-05) can pull from `feature/fe-08-school-feed`: `server/src/utils/feedInteractions.js` (likes and
      comment tree rows) and `client/src/components/CommentThread.jsx` (+ `.css`; gets its API calls and live
      signals as props).
  - FE-05 (Khanh), after the comment reports are merged (17/11, optional until the lead decides): group comment
    reports with `utils/commentReports.js` (how-to in its header comment): report route checked with the §5 rules,
    a queue for the homeroom teacher / group moderator with `source: 'GROUP_POST'` and **their own `groupIds`**, call
    `resolvePendingReports` after a comment is deleted from the thread, pass `api.report` to `CommentThread`.
  - Done by the lead 04/11 (branch `fix/it1-follow-ups`):
    - Group sync for FE-03 saves: `homeroom.service.js` (UC-19) and `teaching.service.js` (UC-18) call
      `syncClassTeachers(conn, classId)` for every class they change, in the same transaction, after saving.
      Tested through the API on the shared DB inside a rolled-back transaction: new homeroom joins the 3 groups
      (one row each, also when already a subject teacher there); previous homeroom leaves STUDENT + PARENT and keeps
      GENERAL while still teaching; new subject teacher joins GENERAL only; a refused save (409) changes no group.
    - FE-03 screen numbers follow `screens.md`: SCR-14 Teacher List, SCR-15 Teacher Detail, SCR-17 Update Teacher,
      SCR-18 Homeroom Assignment, SCR-19 Teaching Assignment (comments and screen badges only).
  - Open (lead to decide): a teacher whose assignment ends on a later date stays in GENERAL after that date until
    the class is synced again (no daily job); an assignment starting later counts from the day it is saved (rule:
    "current or future assignment"). Option: a daily job in FE-09 (It3) that calls `syncClassTeachers` for classes
    whose assignments ended yesterday.
  - FE-13 (Linh) – departments (closing item #2) – **done, merged 07/11** (`server/src/modules/admin/departments.js`
    reuses `findActiveDepartments`; SA reads the list with `GET /admin/accounts/department-options`). Still open: the
    patch in the last point below. The original task:
    Before, UC-17 (FE-03) picked the department from the `departments`
    list, but account create (UC-96 single) and import (UC-96 / UC-97 file) still take free text into
    `teachers.department` (only max 100 is checked), so one department can be spelled several ways and is then missing
    from the UC-17 list. On the shared DB 04/11: one teacher has "Toán - Tin", which is not in the list.
    - Server: account create accepts only a department of the list or none (by id, or by name compared ignoring case
      and accents); the import marks a row whose department is not in the list as an error (new row code, Vietnamese
      text in `messages.js`). Store the list's spelling.
    - A read endpoint for System Admin in the admin module (`GET /teachers/department-options` is School Manager only);
      reuse FE-03's `findActiveDepartments` (`teacher.queries.js`), do not copy the SQL.
    - Client: the "Tổ chuyên môn" field of Create Account becomes a select; the import template help lists the
      departments.
    - Tests: create with a listed department / none / an unknown one; import with "to toan – khoa hoc tu nhien"
      (matched), "Toán - Tin" (row refused); SA can read the list, SM / teacher cannot use the admin endpoint.
    - Then a patch (lead approves before it runs): fix the names not in the list (e.g. "Toán - Tin") and add the
      foreign key / `department_id`. Do not run SQL on the shared DB before the lead approves.

## Iteration 1 (19/10 – 30/10/2026)

### Quoc: FE-01 Personal Account (9 UC)

Also: seed data for the shared DB (school year, semesters, subjects, classes, sample accounts).

| ID | Use case | Actor |
|---|---|---|
| UC-01 | Sign In | User |
| UC-02 | Reset Forgotten Password | User, Email Service |
| UC-03 | Sign Out | User |
| UC-04 | View Profile | User |
| UC-05 | Change Password | User |
| UC-06 | Change Avatar | User |
| UC-107 | Update Address | User |
| UC-108 | Update Occupation | Parent |
| UC-109 | View Child Profile | Parent |

### Anh: FE-02 Student Management (8 UC)

| ID | Use case | Actor |
|---|---|---|
| UC-07 | View Student List | School Manager |
| UC-08 | View Student Detail | School Manager |
| UC-09 | Update Student | School Manager |
| UC-10 | Transfer Student | School Manager |
| UC-11 | Promote Students | School Manager |
| UC-12 | View Student's Parents | School Manager |
| UC-13 | Link / Unlink Parent–Student | School Manager |
| UC-14 | Import Parent–Student Links | School Manager |

### Dung: FE-03 Teacher Management (5 UC)

| ID | Use case | Actor |
|---|---|---|
| UC-15 | View Teacher List | School Manager |
| UC-16 | View Teacher Detail | School Manager |
| UC-17 | Update Teacher | School Manager |
| UC-18 | Assign Teaching Classes & Subjects | School Manager |
| UC-19 | Assign Homeroom Teacher | School Manager |

### Khanh: FE-04 Class & Group Management (16 UC)

| ID | Use case | Actor |
|---|---|---|
| UC-20 | Manage School Years | School Manager |
| UC-21 | Manage Semesters | School Manager |
| UC-22 | View Subject List | School Manager |
| UC-23 | View Subject Detail | School Manager |
| UC-24 | Create Subject | School Manager |
| UC-25 | Update Subject | School Manager |
| UC-26 | Manage Class Types | School Manager |
| UC-27 | Import Class List | School Manager |
| UC-28 | Create Class Group | School Manager |
| UC-29 | View Group List | Teacher, Student, Parent, School Manager |
| UC-30 | View Group Detail | Teacher, Student, Parent, School Manager |
| UC-31 | View Group Members | Teacher, Student, Parent, School Manager |
| UC-32 | Add Group Member | School Manager, Homeroom Teacher |
| UC-33 | Remove Group Member | School Manager, Homeroom Teacher |
| UC-34 | Set Student Nickname | Homeroom Teacher |
| UC-35 | Create Team Chat | Teacher, Student, Parent |

### Linh: FE-13 System Administration (9 UC)

| ID | Use case | Actor |
|---|---|---|
| UC-95 | Create Account | System Admin |
| UC-96 | Import Accounts | System Admin |
| UC-97 | View Account List | System Admin |
| UC-98 | Export Account List | System Admin |
| UC-99 | Update Login Identifiers | System Admin |
| UC-100 | Reset Password | System Admin, School Manager |
| UC-101 | Lock / Unlock Account | System Admin, School Manager |
| UC-102 | Configure System Settings | System Admin |
| UC-103 | Post Maintenance Announcement | System Admin |

## Iteration 2 (02/11 – 13/11/2026)

### Anh: FE-08 School Feed (9 UC)

Built separately from FE-05; shared feed code is merged after both are on `develop`.

| ID | Use case | Actor |
|---|---|---|
| UC-58 | View School Feed & News | Teacher, Student, Parent, School Manager |
| UC-59 | View School Post Detail | Teacher, Student, Parent, School Manager |
| UC-60 | Create School Post | School Manager |
| UC-61 | Update School Post | School Manager |
| UC-62 | Delete School Post | School Manager |
| UC-63 | Pin / Unpin School Post | School Manager |
| UC-64 | React to School Post | Teacher, Student, Parent, School Manager |
| UC-65 | Comment on School Post | Teacher, Student, Parent, School Manager |
| UC-66 | Delete School Post Comment | School Manager |

### Anh: FE-14 Parent Management (3 UC)

Reuses FE-02 parent–student linking (UC-12..14), do not duplicate it. Start after FE-02 is merged.

| ID | Use case | Actor |
|---|---|---|
| UC-104 | View Parent List | School Manager |
| UC-105 | View Parent Detail | School Manager |
| UC-106 | Update Parent Information | School Manager |

### Khanh: FE-05 Group Feed (11 UC)

Built separately from FE-08; shared feed code is merged after both are on `develop`.

| ID | Use case | Actor |
|---|---|---|
| UC-36 | View Group Feed | Teacher, Student, Parent, School Manager (teacher group) |
| UC-37 | View Post Detail | Teacher, Student, Parent, School Manager (teacher group) |
| UC-38 | Create Post | Teacher, Student, Parent, School Manager (teacher group) |
| UC-39 | Edit Own Post | Teacher, Student, Parent, School Manager (teacher group) |
| UC-40 | Delete Own Post | Teacher, Student, Parent, School Manager (teacher group) |
| UC-41 | Comment on Post | Teacher, Student, Parent, School Manager (teacher group) |
| UC-42 | Delete Comment | Teacher, Student, Parent, School Manager |
| UC-43 | React to Post | Teacher, Student, Parent, School Manager (teacher group) |
| UC-44 | Pin / Unpin Post | Homeroom Teacher (class), School Manager (teacher group) |
| UC-45 | Hide Post / Delete Comment | Homeroom Teacher (class), School Manager (teacher group) |
| UC-46 | Approve / Reject Post | Homeroom Teacher (class), School Manager (teacher group) |

### Khanh: FE-06 Messaging (7 UC)

Moved from It2 to It3 on 20/10, back to It2 for Khanh on 03/11 (builds on the FE-04 groups, teams and chat shell).

| ID | Use case | Actor |
|---|---|---|
| UC-47 | Chat in Group | Teacher, Student, Parent, School Manager (teacher group) |
| UC-48 | View Conversation List | Teacher, Student, Parent, School Manager |
| UC-49 | Send Private Message | Teacher, Student, Parent, School Manager (teacher group) |
| UC-110 | Reply to Message | Teacher, Student, Parent, School Manager (teacher group) |
| UC-111 | React to Message | Teacher, Student, Parent, School Manager (teacher group) |
| UC-112 | Insert Emoji | Teacher, Student, Parent, School Manager (teacher group) |
| UC-113 | Delete Message | Teacher, Student, Parent, School Manager (teacher group) |

### Dung: FE-10 Schedule Management (6 UC)

Timetable part only (UC-70..75).

| ID | Use case | Actor |
|---|---|---|
| UC-70 | View Timetable Management | School Manager |
| UC-71 | Create Class Timetable | School Manager |
| UC-72 | Import Class Timetable | School Manager |
| UC-73 | Update Class Timetable | School Manager |
| UC-74 | View Class Timetable | Teacher, Student, Parent |
| UC-75 | View Teaching Schedule | Teacher |

### Linh: Testing and integration of It1 + It2 features.

### Quoc: Review.

## Iteration 3 (16/11 – 25/11/2026)

### Dung: FE-10 Schedule Management (5 UC)

Class calendar (UC-76..80) + job: class event reminder 1 day before. Moved from It2 on 20/10.

| ID | Use case | Actor |
|---|---|---|
| UC-76 | View Class Calendar | Teacher, Student, Parent |
| UC-77 | View Calendar Event Detail | Teacher, Student, Parent |
| UC-78 | Create Calendar Event | Teacher |
| UC-79 | Update Calendar Event | Teacher (event creator) |
| UC-80 | Delete Calendar Event | Teacher (event creator) |

Added 13/11/2026 at Dung's request (no UC ids yet – the lead decides; business rules §10):
- **Period times** (School Manager): start of each session + one period length, breaks unchanged – `/timetables/period-times`.
- **Automatic scheduling** (17/11, School Manager): "Xếp tự động" on SCR-27 – teaching assignment + timetable of a
  semester as a draft, applied with the SCR-19 / UC-71 code (business rules §10). Sample data: sample_auto_schedule.sql (grade 10) and
  sample_grade_11_12.sql (grades 11 and 12, 17/11), sample_fill_assignments.sql (18/11: fills the missing teaching
  assignments of the current year so every teacher has classes; then "Chỉ xếp tiết" per grade makes the timetables).
- **Timetable history** (17/11, School Manager): "Lịch sử" per class on SCR-27 – every saved timetable kept (old ones
  soft-deleted, never edited), what replaced what, periods held, CSV export. No schema change (business rules §10).
- **School calendar** (School Manager manages, everyone reads): `/school-events`, the "Lịch sắp tới của trường" column
  of the school feed and the class calendar. Needs `patch_v0.3_school_events.sql` (found on the shared DB 18/11).

### Dung: FE-07 Extracurricular Event Management (8 UC)

| ID | Use case | Actor |
|---|---|---|
| UC-50 | Create Event | Homeroom Teacher |
| UC-51 | Update Event | Homeroom Teacher |
| UC-52 | Cancel Event | Homeroom Teacher |
| UC-53 | View Event Detail | Homeroom Teacher, Student, Parent |
| UC-54 | Register Child for Event | Parent |
| UC-55 | Cancel Child Registration | Parent |
| UC-56 | View Registration List | Homeroom Teacher |
| UC-57 | Export Registration List | Homeroom Teacher |

Status: merged into `develop` 18/11 (built by Dung from 12/11 on `feature/fe-07-extracurricular`) – module
`server/src/modules/extracurricular/` (`/api/v1/extracurricular-events`), client `client/src/pages/extracurricular/`
(menu "Ngoại khoá"; SCR-66 form with live preview, SCR-67 registration list from Stitch; detail page for UC-53).
`database/patch_v0.3_activity_title.sql` (new column `extracurricular_events.title`, found on the shared DB 18/11) – until it
runs, the API answers 503 `MSG_ACTIVITY_NOT_READY` and the feed works as before. Rules and ASSUMPTIONs: business
rules §7 "As built". Follow-ups: FE-09 (Quoc) calls `sendActivityDeadlineReminders()` from the UC-69 job; FE-05
(Khanh) – `posts.service.js` now adds `activity` to posts and refuses edit / delete of an activity's post (3 small
hooks, marked FE-07).

### Quoc: FE-09 Notifications (3 UC)

| ID | Use case | Actor |
|---|---|---|
| UC-67 | View Notifications | User |
| UC-68 | View Notification Read Status | Teacher |
| UC-69 | Send Event Reminders | Scheduler |

### Quoc: FE-12 Attendance Management (5 UC)

| ID | Use case | Actor |
|---|---|---|
| UC-90 | Take Attendance | Teacher |
| UC-91 | Edit Attendance | Homeroom Teacher, School Manager |
| UC-92 | View Student Attendance | Student, Parent |
| UC-93 | View Class Attendance | Teacher |
| UC-94 | View School Attendance Statistics | School Manager |

### Linh: FE-11 Grade Management (9 UC)

| ID | Use case | Actor |
|---|---|---|
| UC-81 | Configure Grade Structure | School Manager |
| UC-82 | Copy Grade Structure | School Manager |
| UC-83 | Enter Grades | Teacher |
| UC-84 | Import Grades | Teacher |
| UC-85 | Finalize Grades | Teacher |
| UC-86 | Unlock Grades | School Manager |
| UC-87 | View Grade Change History | School Manager |
| UC-88 | View Grades | Teacher, Student, Parent, School Manager |
| UC-89 | View Class Ranking | Teacher, Student, Parent, School Manager |

Total: 113 use cases.
