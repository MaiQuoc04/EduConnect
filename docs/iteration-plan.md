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
| Iteration 2 | 02/11 – 13/11/2026 | review | FE-05 | FE-10 timetable | FE-08, FE-14 | testing, integration |
| Iteration 3 | 16/11 – 27/11/2026 | FE-09, FE-12 | FE-06 | FE-10 calendar, FE-07 | – | FE-11 |

FE-10 is split: timetable in It2, class calendar in It3.

## Current status (read first; update after every merge, schema patch or new decision)

Last updated: 03/11/2026 (FE-04 merged; FE-02 lead's follow-ups and UC-14 done on the branch, waiting for review).

- **Shared DB (Supabase):** schema v0.3 + `patch_v0.3_password_reset_requests.sql` (27/10) +
  `patch_v0.3_users_address.sql` (28/10: `users.address` added, `parents.address` dropped) +
  `patch_v0.3_reset_request_password.sql` (31/10: `password_reset_requests.temp_password_enc`) +
  `patch_v0.3_reset_cooldown_codes.sql` (01/11: reset cooldown setting, GV / HS codes padded to 4 digits) +
  `patch_v0.3_reset_request_delivery.sql` (01/11: `password_reset_requests.delivery`) +
  `patch_v0.3_departments.sql` (FE-03, already run before review; kept by the lead 02/11: table `departments`) +
  `patch_v0.3_class_track_grade.sql` (FE-04, run by Khanh 02/11 before approval; accepted 03/11:
  `class_tracks.grade_level_id`). 48 tables.
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
- **Not merged yet:** `feature/fe-02-student-management` (Anh), `develop` already merged into it. UC-07..UC-14
  built (all 8 FE-02 use cases) and the lead's FE-02 follow-ups done (03/11, see "Follow-ups owed"); waiting for
  Anh's push / PR and the lead's review. No schema change, no SQL run on the shared DB.
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
- **Numbering changes (01/11):** UC-104 View Activity Log and SCR-64 Activity Log removed; UC-105..UC-110 became
  UC-104..UC-109 and SCR-65..SCR-71 became SCR-64..SCR-70; then SCR-71 Password Reset Requests (FE-13) was added.
  109 use cases, 71 screens.
- **Use cases added after the plan:** UC-107 Update Address (User, 28/10), UC-108 Update Occupation (Parent, 29/10),
  UC-109 View Child Profile (Parent, 01/11), all FE-01 (Quoc, It1).
- **Follow-ups owed:**
  - FE-13 (Linh): pull `develop` and continue from it; do not run SQL patches on the shared DB before the lead
    approves them.
  - FE-02 (Anh) – the lead's list is done on the branch (03/11), all tested on the throw-away local DB
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
    - For the lead to decide:
      - "Transfer back to an old class → old group rows come back" cannot run: `class_enrollments` has
        `UNIQUE (student_id, class_id)`, so a transfer back is refused (`MSG_CLASS_ALREADY_ENROLLED`). Reopening old
        rows is tested through UC-13 / UC-14 (parent unlinked, then linked again). Keep the constraint and drop the
        case, or change the schema?
      - Still in business rules §4 "Who puts a student in a class" but not enforced by FE-02 yet: UC-11 only from the
        school year just before (code allows any earlier year) and only to the next or the same grade; the 45-student
        class limit in UC-10 / UC-11; refusing a school year that has ended in UC-10 / UC-11.
      - Error codes waiting for `messages.js` (texts proposed in the page / hand-over): `MSG_PARENT_PHONE_NOT_FOUND`,
        `MSG_DUPLICATE_LINK_IN_FILE` (new for UC-14) and the earlier FE-02 codes (`MSG_STUDENT_NOT_FOUND`,
        `MSG_INVALID_RELATIONSHIP_TYPE`, `MSG_LINK_ALREADY_EXISTS`, `MSG_MAX_PARENTS_REACHED`, `WARN_*`…); the FE-02
        pages map them locally for now.
      - UC-14 `// ASSUMPTION:`s: relationship words compared without accents / case; the 2-parent count only counts
        earlier VALID rows; "same pair twice" counts any earlier row with that pair; the preview opens on all rows
        (not only errors) so the names are read before confirming.
      - Proposal: move UC-96's file reading (`loadWorksheet`, `headerKey`, not exported) into `utils/excel.js` and the
        import screen classes of `pages/admin/admin.css` into `styles.css`; UC-14 mirrors the first and imports the
        second.
    - Left for Anh: push `feature/fe-02-student-management` and open the PR into `develop`.
  - FE-04 / FE-14 (Khanh):
    - FE-14 (It2) uses UC-104..UC-106; a parent's address is `users.address`, occupation stays `parents.occupation`.
  - Group sync for FE-03 saves: business rules §4 "Class group membership follows the class" –
    `server/src/modules/teacher/homeroom.service.js` (UC-19) and `teaching.service.js` (UC-18) must call
    `await syncClassTeachers(client, classId)` (FE-04 `classGroups.js`) for every class they change, in the same
    transaction, after saving; they do not yet. Owner to be decided by the lead.
  - FE-03 screen numbers (lead, after all It1 merges): code uses SCR-13..17, `screens.md` has SCR-14 Teacher List,
    SCR-15 Teacher Detail, SCR-17 Update Teacher, SCR-18 Homeroom Assignment, SCR-19 Teaching Assignment.
  - FE-13 (Linh): account create / import still take free-text `teachers.department`; switch to the `departments`
    list (`GET /teachers/department-options`), then a foreign key can be added.

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

### Anh: FE-05 Group Feed (11 UC)

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

### Khanh: FE-08 School Feed (9 UC)

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

### Khanh: FE-14 Parent Management (3 UC)

Reuses FE-02 parent–student linking (UC-12..14), do not duplicate it.

| ID | Use case | Actor |
|---|---|---|
| UC-104 | View Parent List | School Manager |
| UC-105 | View Parent Detail | School Manager |
| UC-106 | Update Parent Information | School Manager |

### Linh: Testing and integration of It1 + It2 features.

### Quoc: Review.

## Iteration 3 (16/11 – 27/11/2026)

### Anh: FE-06 Messaging (3 UC)

Moved from It2 on 20/10.

| ID | Use case | Actor |
|---|---|---|
| UC-47 | Chat in Group | Teacher, Student, Parent, School Manager (teacher group) |
| UC-48 | View Conversation List | Teacher, Student, Parent, School Manager |
| UC-49 | Send Private Message | Teacher, Student, Parent, School Manager (teacher group) |

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

Total: 109 use cases.
