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

Code due dates: It1 30/10, It2 13/11, It3 27/11.

| Iteration | Dates | Quoc | Anh | Dung | Khanh | Linh |
|---|---|---|---|---|---|---|
| Iteration 1 | 19/10 – 30/10/2026 | FE-01 | FE-02 | FE-03 | FE-04 | FE-13 |
| Iteration 2 | 02/11 – 13/11/2026 | review | FE-08, FE-14 | FE-10 timetable | FE-05, FE-06 | testing, integration |
| Iteration 3 | 16/11 – 27/11/2026 | FE-09, FE-12 | – | FE-10 calendar, FE-07 | – | FE-11 |

FE-10 is split: timetable in It2, class calendar in It3. It2 changed by the lead on 03/11/2026: Anh takes FE-08 School
Feed and FE-14 Parent Management (follows FE-02), Khanh takes FE-05 Group Feed and FE-06 Messaging (follow FE-04
groups; FE-06 moved back from It3). FE-05 and FE-08 are built separately; code they share (posts, comments,
reactions, attachments) is merged into one place after both are on `develop`.

## Current status (read first; update after every merge, schema patch or new decision)

Last updated: 07/11/2026 (FE-06 Messaging merged with UC-110..UC-113, patch run on the shared DB; FE-13 departments
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
  `patch_v0.3_message_actions.sql` (FE-06, run by Khanh 07/11 after the lead's OK: reply, delete, reactions). 50 tables.
- **Waiting for the lead (FE-03, 07/11):** `patch_v0.3_department_subjects.sql` – table `department_subjects` (subjects
  of each department) with the starting list (business rules §4). Not run on the shared DB yet; after it: 51 tables.
  Until it runs, the Departments screen answers MSG_DEPARTMENTS_NOT_READY and Update Teacher does not limit subjects.
- **FE-10 (Dung, 10/11, lead OK for new tables):** `patch_v0.3_timetables.sql` – tables `timetables` (version of a class
  timetable with its date range) and `timetable_entries` (weekly pattern). Run after `patch_v0.3_department_subjects.sql`;
  after both: 53 tables. Until it runs, the timetable screens answer MSG_TIMETABLES_NOT_READY.
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
  - FE-06 (Khanh) merged 07/11: UC-47 Chat in Group, UC-48 View Conversation List, UC-49 Send Private Message,
    UC-110..UC-113 message actions, UC-35 teacher teams; module `server/src/modules/conversations/`, screens in
    `client/src/pages/chat/`. Needs `patch_v0.3_message_actions.sql` (run on the shared DB 07/11).
- **Not merged yet:** none of It1. It2 branches start from `develop`.
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
  | 3 | Replace the temporary `GET /students/parents/lookup` with FE-14 UC-104 | Anh | with FE-14 (It2) |
  | 4 | Shared Excel reading `utils/excel.js` for UC-96 / UC-14 / UC-27 (It2 clean-up, after the features merge) | Linh | It2 clean-up |
  | 5 | Decide: who adds a new department (SQL only today, or a screen for SM / SA) | Quoc | **decided 07/11**: School Manager, Departments screen (UC-114, FE-03, branch `feature/fe-03-teacher-management`) |
  | 6 | Decide: the empty test school years on the shared DB (2025-2026, 2028-2029, 2030-2031; no classes; `school_years` has no `deleted_at`) – keep or remove | Quoc | 07/11 |
  | 7 | Decide: daily job to sync class groups when an assignment ends later (see "Open" below; proposal: FE-09, It3) | Quoc | before It3 |

- **FE-03 additions (Dung, 07/11, agreed with the lead; branch `feature/fe-03-teacher-management`, PR into
  `develop`):** UC-114 Manage Departments (`/departments`, SCR-72), UC-115 Export Teacher List
  (`GET /teachers/export`), UC-116 Import Teachers (`/teachers/import…`, SCR-73, reuses FE-13's
  `accountImport.service.js`), teaching assignments with start and end dates and history by range (UC-18,
  `GET /teaching-assignments?from=&to=`, `PUT` body `{ startDate, endDate }`; `date` is still read as the start).
  Rules in business rules §4 "Teachers". Touches FE-13 files (Linh, please review): `admin/departments.js`
  (department names compared with FE-03's `departmentKey`, so "Tổ Toán - Tin" typed with "-" matches "Tổ Toán – Tin")
  and `pages/admin/ImportAccountsPage.jsx` (optional `config` prop; System Admin page unchanged).
- **Follow-ups owed:**
  - FE-10 (Dung, It2): the timetable uses the date ranges of `teaching_assignments` – a period's teacher is the one
    whose assignment covers that date (no substitute teaching outside an assignment).
  - FE-13 (Linh): pull `develop` and continue from it; do not run SQL patches on the shared DB before the lead
    approves them.
  - FE-13 (Linh), after FE-06 (owed since 07/11): the setting `chat.delete_for_everyone_minutes` is listed on the
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
    - Left after the merge: FE-14 (Anh) replaces the temporary `GET /students/parents/lookup` with UC-104; the
      `utils/excel.js` clean-up with FE-13 in It2.
  - FE-14 (Anh, It2 since 03/11): uses UC-104..UC-106; a parent's address is `users.address`, occupation stays
    `parents.occupation`.
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

## Iteration 3 (16/11 – 27/11/2026)

### Dung: FE-10 Schedule Management (5 UC)

Class calendar (UC-76..80) + job: class event reminder 1 day before. Moved from It2 on 20/10.

| ID | Use case | Actor |
|---|---|---|
| UC-76 | View Class Calendar | Teacher, Student, Parent |
| UC-77 | View Calendar Event Detail | Teacher, Student, Parent |
| UC-78 | Create Calendar Event | Teacher |
| UC-79 | Update Calendar Event | Teacher (event creator) |
| UC-80 | Delete Calendar Event | Teacher (event creator) |

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

### Quoc: FE-09 Notifications (3 UC)

| ID | Use case | Actor |
|---|---|---|
| UC-67 | View Notifications | User |
| UC-68 | View Notification Read Status | Teacher, School Manager |
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
