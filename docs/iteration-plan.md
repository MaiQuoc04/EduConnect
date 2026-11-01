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

Last updated: 01/11/2026.

- **Shared DB (Supabase):** schema v0.3 + `patch_v0.3_password_reset_requests.sql` (27/10) +
  `patch_v0.3_users_address.sql` (28/10: `users.address` added, `parents.address` dropped) +
  `patch_v0.3_reset_request_password.sql` (31/10: `password_reset_requests.temp_password_enc`) +
  `patch_v0.3_reset_cooldown_codes.sql` (01/11: reset cooldown setting, GV / HS codes padded to 4 digits) +
  `patch_v0.3_reset_request_delivery.sql` (01/11: `password_reset_requests.delivery`). 47 tables.
- **develop:**
  - FE-01 complete for It1 (merged 01/11): UC-01..UC-06, UC-107 Update Address, UC-108 Update Occupation,
    UC-109 View Child Profile, password reset request with sign-in name + full name check; forced password change
    after a temporary password asks only for the new password (01/11); the requests page lists emailed resets too
    ("sent by email" / "to hand over", 01/11).
  - FE-13 (Linh) merged 01/11 with the team lead's decisions applied: automatic reset from a request (email or
    SA / SM read the password), cooldown setting, role-based usernames, HS / GV + 4-digit codes, phone format,
    no SA creation from screens, settings ranges, UC numbers fixed. UC-95..UC-103 built; "View Activity Log"
    removed (log kept in the DB only).
- **Pushed, not merged yet:** `feature/fe-02-student-management` (Anh), `feature/fe-03-teacher-management` (Dung),
  `feature/fe-04-class-group-management` (Khanh). Each should merge `develop` into its branch before its PR.
- **Numbering changes (01/11):** UC-104 View Activity Log and SCR-64 Activity Log removed; UC-105..UC-110 became
  UC-104..UC-109 and SCR-65..SCR-71 became SCR-64..SCR-70. 109 use cases, 70 screens.
- **Use cases added after the plan:** UC-107 Update Address (User, 28/10), UC-108 Update Occupation (Parent, 29/10),
  UC-109 View Child Profile (Parent, 01/11), all FE-01 (Quoc, It1).
- **Follow-ups owed:**
  - FE-13 (Linh): pull `develop` and continue from it; do not run SQL patches on the shared DB before the lead
    approves them.
  - FE-02 (Anh): `parents.address` → `users.address`; phone input = business rules §3 (use `utils/phone.js`, only
    `0` + 9 digits); UC references to FE-14 shift by one (UC-105 → UC-104).
  - FE-04 (Khanh): screen references shift by one (SCR-66 → SCR-65, SCR-70 → SCR-69, SCR-71 → SCR-70); FE-14 (It2)
    uses UC-104..UC-106, a parent's address is `users.address`, occupation stays `parents.occupation`.

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
