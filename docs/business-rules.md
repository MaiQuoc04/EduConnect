# EduConnect – business rules (agreed by the team, up to 20/10/2026)

These rules override anything you might assume from "typical" school apps. When a rule here conflicts with an
older document (Report 1–3 v1.0, old ERD images), **this file wins**. If something is not covered, ask the team
instead of inventing a rule.

The app serves **one high school** (grades 10–12). Users never self-register.

## 1. Actors and roles
| Role code | Who | Scope |
|---|---|---|
| `SYSTEM_ADMIN` | IT admin | Accounts and system only: create / import / export accounts, change login identifiers, reset passwords and lock / unlock **any** account, system settings, activity log, maintenance. **Cannot see any content** (feeds, chats, grades, school posts), is in no group, cannot create teams. |
| `SCHOOL_MANAGER` | Principal / office staff (several, equal rights) | All school business. Views and updates student / parent / teacher profiles (cannot create or delete them). Resets passwords and locks / unlocks student, parent and teacher accounts. Manages the **school-wide teacher group** (pin / hide / approve) and the school feed. **Does not see class feeds or class chats.** Private messages only with people in the teacher group. Views grades and rankings of the whole school (read only), unlocks grades, views grade history, corrects attendance after the day, sees school-wide attendance statistics. |
| `TEACHER` | Teachers | Teaches assigned classes / subjects. A teacher becomes **Homeroom Teacher** of a class when `classes.homeroom_teacher_id` points to them – this is **not a separate role**. |
| `STUDENT` | Students | Own data, own classes and groups. |
| `PARENT` | Parents / guardians | Their children's data; picks a child first on child-specific screens. |

- One account can have **several roles** (`user_roles`). The header has a **role switcher**; permissions follow the
  **active role** (`req.user.activeRole`), never the union of roles.
- `SYSTEM_ADMIN` and `STUDENT` are **exclusive**: an account with one of them has no other role. Other roles combine
  freely (e.g. Teacher + Parent, School Manager + Teacher). Check this in code when assigning roles.
- "School Manager does not teach" means the SM role has no teaching rights; teaching rights come from the Teacher role.

## 2. Features (14) and owners
| FE | Name | Owner | Iteration |
|---|---|---|---|
| FE-01 | Personal Account | Quoc | It1 |
| FE-02 | Student Management | Anh | It1 |
| FE-03 | Teacher Management | Dung | It1 |
| FE-04 | Class & Group Management | Khanh | It1 |
| FE-13 | System Administration | Linh | It1 |
| FE-05 | Group Feed | Anh | It2 |
| FE-08 | School Feed | Khanh | It2 |
| FE-14 | Parent Management | Khanh | It2 |
| FE-10 | Schedule Management – timetable | Dung | It2 |
| FE-10 | Schedule Management – class calendar (UC-76..80) | Dung | It3 |
| FE-06 | Messaging | Anh | It3 |
| FE-07 | Extracurricular Event Management | Dung | It3 |
| FE-09 | Notifications | Quoc | It3 |
| FE-11 | Grade Management | Linh | It3 |
| FE-12 | Attendance Management | Quoc | It3 |

Iterations: It1 code due 30/10, It2 13/11, It3 27/11 (2026). Full use case list: `docs/use-cases.md`.

Boundaries that are easy to get wrong:
- FE-01 = what users do with **their own** account (sign in, password, profile, automatic temporary sign-in lock).
  There is **no activate / deactivate**.
- Reset password and lock / unlock belong to **FE-13**, even when the button sits on a student / teacher / parent
  detail screen.
- FE-02 owns linking students and parents (and importing links); FE-14 screens reuse it.
- FE-04 contains school years, semesters, subjects, class types, class groups, the teacher group and teams.
- FE-10 contains both the timetable and the class calendar. **Class events (FE-10) ≠ extracurricular activities
  (FE-07)** – never mix them.

## 3. Accounts and sign-in (FE-01, FE-13)
- Flow: the school collects data outside the system → SA imports / creates accounts → SM manages profiles.
  Importing accounts (SA) is separate from importing classes (SM); a class import needs the accounts to exist.
- Sign in with **email, phone number or username** + password.
- `username` is required and generated: first name + initials of family name and middle name, no accents
  (Nguyen The Anh → `anhnt`); if taken add a number (`anhnt1`, `anhnt2`). Not all digits, no `@`.
  Only SA changes email / phone / username.
- Email optional for everyone. **Phone required for parents** (it identifies a parent with several children),
  optional for students and teachers. Email and phone are unique when present.
- Password: 8–32 characters with a digit, a lowercase letter, an uppercase letter and a special character; not equal
  to the previous password; must not contain the username or phone number.
- Initial / reset password: random, shown **once** to SA/SM; `must_change_password = TRUE` forces a change at the
  next sign-in. Users without email get it outside the system.
- **Temporary sign-in lock** (automatic, different from a manual account lock): after 5 wrong passwords lock for
  5 minutes; each further group of 5 adds 5 minutes, max 30; one correct sign-in resets the counter; SM/SA can clear
  it. Values come from `system_settings`.
- Account status is only `ACTIVE` or `LOCKED`. **Accounts are never deleted – they are locked.**
- A locked teacher (even a homeroom teacher) stays in groups with a "Locked" label (from `users.status`); all SMs
  are notified; SM reassigns homeroom / subject teaching; the timetable updates; old grades stay. Without a homeroom
  teacher nobody approves that class's posts, and the class shows a warning.
- Max **2 parents per student** (check in code).
- Forgot password: 6-digit OTP by email, valid 5 minutes, stored **hashed**, invalid after 5 wrong attempts.
- **Password reset request** (agreed 27/10/2026): a user who cannot use the OTP (no email, lost mailbox…) sends a
  request from the Forgot Password screen (sign-in name + optional reason, max 500 characters). The screen always
  answers "request sent" (does not reveal whether the account exists); at most one PENDING request per account.
  SA handles any account, SM only student / parent / teacher accounts; all of them get a notification. The handler
  checks the person's identity outside the system, then resets with UC-100 (marks the request DONE) or rejects it.
  SA / SM can still reset directly from the account screens without a request. Sending a request is not logged;
  the reset is (`PASSWORD_RESET`).
- During **maintenance** (`maintenance_announcements` window) nobody except System Admin can sign in; users see
  "The system is under maintenance". When SA schedules maintenance, all accounts are notified and a banner shows
  beforehand.
- Auto sign-out after inactivity: **not decided yet** (JWT currently expires after 8 h).

## 4. School structure (FE-04)
- `school_years` → two `semesters` (1, 2) with status `OPEN` / `CLOSED`. SM closes a semester; closing **only ends
  attendance corrections** (it does not lock grades).
- Classes are created **per school year** (10A1 of 2026–2027 is a different row from 10A1 of 2027–2028).
  Promotion = new enrollment in the new class; transfer = old enrollment `TRANSFERRED` + new enrollment.
- Every class has a **class type** (`class_tracks`, NOT NULL), e.g. type A = Maths/Physics/Chemistry focus.
  `track_subjects` holds, per school year, each subject's **weight** and **periods per week** for that type; copied
  from the previous year by default; editable, but weights **lock once the year has grades**.
- Homeroom teacher may be empty → show a warning so SM assigns one.
- `teacher_subjects`: which subjects a teacher can teach (one teacher may teach several). Teaching assignments only
  for subjects the teacher can teach.
- Importing a class creates 3 groups automatically: **GENERAL** (feed + chat), **STUDENT** (chat), **PARENT** (chat).
  Groups can also be created by hand. One **TEACHER_SCHOOL** group for the whole school (feed + chat, all teachers +
  SMs, managed by SM, reused across years). After promotion, last year's groups are read only.
- **Teams** (`TEAM_CHAT`): chat only, members from one class; Teachers, Students and Parents can create them
  (`groups.created_by`); SA and SM cannot.
- Student **nickname** is set by the homeroom teacher and shown only inside that class.

## 5. Group feed (FE-05)
- All members of a GENERAL group (or the teacher group) can post. **Post approval is on by default** and can be
  switched off per group (`groups.require_approval`). Posts by the homeroom teacher are auto-approved.
- Moderators: homeroom teacher for class groups, SM for the teacher group. They pin, **hide posts**, approve /
  reject posts and **delete any comment** in the group.
- Comments are **deleted (soft), never hidden**. Who can delete a comment: its author, the author of the post, or
  the group moderator.
- Comments support **multi-level replies** (`parent_comment_id`).
- Only **Like** (no other reactions). One like per user per post; unlike removes the row.
- Images, files and videos can be attached to posts and messages: images / files ≤ 10 MB, video ≤ 50 MB.
  Files live in cloud storage; the DB stores the URL (`attachments`).

## 6. Messaging (FE-06)
- Group chats (GENERAL / STUDENT / PARENT / TEACHER_SCHOOL / TEAM_CHAT) and **1-1 chats**. A 1-1 chat is a group of
  type `DIRECT` with 2 members and `direct_key = "<smallerUserId>_<largerUserId>"` (unique → never two chats for the
  same pair). Every message has a `group_id`.
- Private messages only with people in one's own classes (SM: within the teacher group). Phone and email are visible
  only to teachers and SM.
- Read receipts: `group_members.last_read_at`; "seen by" = members whose `last_read_at ≥ message.sent_at`.
- Removing a member / transferring a student sets `group_members.left_at` (row is kept).

## 7. Extracurricular activities (FE-07)
- The homeroom teacher posts an activity in the class feed (a `posts` row + `extracurricular_events` row) with a
  registration deadline and an optional capacity (NULL = unlimited; full = registration blocked).
- **Parents** register / cancel their child before the deadline (either parent; one registration row per student,
  re-registering reuses the row). Students do not register themselves.
- The homeroom teacher views and exports the registration list (Excel) and can cancel the activity (registered
  parents are notified).

## 8. School feed (FE-08)
- Only SM posts. Two post types:
  - **ANNOUNCEMENT**: audience must be chosen (grades and/or classes), can be liked and commented on, can be pinned,
    sends a notification by default.
  - **NEWS**: view only (no likes / comments), whole school by default, not pinned, no notification by default.
- No audience rows = whole school; choosing grade levels sends notifications to those grades only.
- SM can delete any comment on announcements; users can delete their own.

## 9. Notifications (FE-09)
- **General** notifications (bell): short, cover everything (new posts, school news, events…); clicking opens the
  source item (`target_type` + `target_id`).
- **Personal** notifications (`is_personal = TRUE`): important items with more detail (absence, class event
  tomorrow, activity registration opened / deadline / cancelled…), shown on the personal notifications page; parents
  can filter by child (`notification_recipients.student_id`).
- Storage: content once in `notifications`, **one row per recipient** in `notification_recipients` (`read_at`).
- The creator of an item (teacher for class events / activities, SM for announcements) can see **who has not read**
  a personal notification (UC-68).
- Parents are notified when their child's attendance is anything other than "present".

## 10. Timetable and class calendar (FE-10)
- SM enters or imports a **weekly pattern** per class plus a date range; the system generates **one
  `timetable_slots` row per period per day**. Changing the timetable from date X regenerates rows from X; rows that
  already have attendance are kept.
- The DB blocks clashes: one class or one teacher cannot have two lessons in the same period of the same day.
- **No substitute teaching**: the timetable teacher must match the teaching assignment.
- Teachers' teaching schedules are built automatically; parents pick a child to view a timetable.
- **Class events** (e.g. 15-minute test, parent meeting): a subject teacher creates events for their own subject;
  the homeroom teacher can also create general events (`subject_id` NULL). Category from a fixed list
  (`event_categories`: Test, Assignment deadline, Parent meeting, Class meeting, Other – no UI to edit it).
- Audience: homeroom teacher and creator always see it; the creator ticks groups (all students / all parents / all
  subject teachers of the class) **and/or** picks specific people (`class_event_viewers`).
- Events appear automatically in the viewers' day calendar – there is **no "add to timetable" button**.
- One reminder **1 day before** the event (`class_events.reminded_at`; cleared when the time changes; events created
  less than a day ahead get no reminder). Only the creator updates / deletes an event.

## 11. Grades (FE-11)
- SM configures the grade structure per **subject × grade level × semester**: components with a weight and a number
  of scores (`score_count`, e.g. regular tests = 4 scores, mid-term = 1, final = 1). Semester 2 is copied from
  semester 1 and edited independently; copying to another subject makes an independent copy. **The structure locks
  once the semester has grades.**
- Each individual score is its own `grades` row (`attempt_no`); averages are **not stored**, they are computed:
  subject semester average = weighted average of the scores present; subject year average = (S1 + 2 × S2) / 3;
  student year average = average of subjects (weighted by `track_subjects.weight`).
- Teachers enter / import grades only for their assigned class + subject.
- **Finalize** (UC-85) locks the grade book (class × subject × semester, `grade_locks`). It is **blocked if any
  currently studying student is missing a score**. To change a finalized grade the teacher asks SM outside the
  system; SM **unlocks** (UC-86); the teacher edits and finalizes again.
- Every grade entry and change is logged in `grade_histories` (first entry has `old_score` NULL). Grade rows are never
  deleted; clearing a score = `score` NULL.
- Viewing: students / parents only their own / child's; teachers see all grades of classes they teach; SM sees the
  whole school (read only). Students / parents see only their own rank.

## 12. Attendance (FE-12)
- Per period, 4 statuses: `PRESENT`, `LATE`, `ABSENT_EXCUSED`, `ABSENT_UNEXCUSED`. No leave-request feature.
- The subject teacher takes attendance for periods they teach and can edit until **23:59 the same day**. After that:
  the homeroom teacher (own class) can only switch excused ↔ unexcused, until the semester is closed; every other
  change is SM only.
- **Every action is logged** in `attendance_histories`, including the first take (`old_status` NULL).
- Students, parents and teachers of the class view per period; SM sees school-wide statistics; export to Excel.
  Attendance does not affect grades.

## 13. System administration (FE-13)
- `system_settings` (key–value, loaded by SQL; SA edits values only): sign-in lock thresholds, upload limits, OTP
  lifetime, attendance edit deadline.
- `activity_logs` (never deleted) records only important actions: sign-in success / failure, account create /
  import / lock / unlock, password reset, role change, setting change, grade unlock.

## 14. Deleting data
- **Every delete in the system is a soft delete** (`deleted_at`, often `deleted_by`): never `DELETE` business rows,
  always filter `deleted_at IS NULL`.
- Hard delete is allowed only for technical / configuration rows: `post_likes` (unlike), `class_event_viewers`,
  `teacher_subjects`, `user_roles`, `student_parents` (unlink), expired OTPs.
- Status changes instead of deletes: accounts (`LOCKED`), enrollments (`TRANSFERRED` / `DROPPED`), group members
  (`left_at`), activity registrations (`CANCELLED`), activities (`CANCELLED`).

## 15. Open questions (do not decide them in code – ask)
- Auto sign-out time after inactivity.
- Final cloud storage provider for files; whether attachments get a `storage_key` and short-lived links for private
  files (proposed, not confirmed).
