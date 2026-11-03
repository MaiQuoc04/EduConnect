# EduConnect – business rules (agreed by the team, up to 20/10/2026)

These rules override anything you might assume from "typical" school apps. When a rule here conflicts with an
older document (Report 1–3 v1.0, old ERD images), **this file wins**. If something is not covered, ask the team
instead of inventing a rule.

The app serves **one high school** (grades 10–12). Users never self-register.

## 1. Actors and roles
| Role code | Who | Scope |
|---|---|---|
| `SYSTEM_ADMIN` | IT admin | Accounts and system only: create / import / export accounts, change login identifiers, reset passwords and lock / unlock **any** account, system settings, maintenance. **Cannot see any content** (feeds, chats, grades, school posts), is in no group, cannot create teams. |
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
| FE-05 | Group Feed | Khanh | It2 |
| FE-08 | School Feed | Anh | It2 |
| FE-14 | Parent Management | Anh | It2 |
| FE-06 | Messaging | Khanh | It2 |
| FE-10 | Schedule Management – timetable | Dung | It2 |
| FE-10 | Schedule Management – class calendar (UC-76..80) | Dung | It3 |
| FE-07 | Extracurricular Event Management | Dung | It3 |
| FE-09 | Notifications | Quoc | It3 |
| FE-11 | Grade Management | Linh | It3 |
| FE-12 | Attendance Management | Quoc | It3 |

Iterations: It1 code due 30/10, It2 13/11, It3 27/11 (2026). Owners of FE-05, FE-06, FE-08 and FE-14 changed on 03/11. Full use case list: `docs/use-cases.md`.

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
- **System Admin accounts are never created from the screens or the import** (01/11/2026): SA is a sensitive role;
  the few IT admins are created with `npm run seed:admin` (username typed by hand, use `sa.<name>`).
- **Codes** (01/11/2026): student code = `HS` + 4 digits (`HS0123`), teacher code = `GV` + 4 digits (`GV0042`);
  typed lower case is accepted and stored upper case. Parents, School Managers and System Admins have no code.
- Sign in with **email, phone number or username** + password.
- `username` is required and **generated when the account is created** (formats agreed 01/11/2026). Name part =
  first name + initials of family name and middle name, no accents (Nguyen The Anh → `anhnt`). By role:
  - Student: name + student code in lower case → `anhnths0123`; Teacher: name + teacher code → `anhntgv0042`
    (unique because the codes are).
  - School Manager: `sm.` + name → `sm.anhnt`; Parent: `ph.` + name → `ph.anhnt`; if taken add a number
    (`ph.anhnt1`, `ph.anhnt2`). System Admin: `sa.` + name (created by hand, see above).
  - Several roles: Student > Teacher > School Manager > Parent. Adding or removing a role later does not rename.
  - Allowed characters for every username: `a–z`, `0–9`, `.` and `_`, 3–50 characters, not all digits, no `@`.
  - Only SA changes email / phone / username; an edited username only has to meet the character rule and be
    unique, not the generated format. Existing usernames (sample data: `huynq`, `lannt`…) are kept.
- **Own profile** (agreed 28/10/2026, occupation added 29/10/2026): users change only these profile fields
  themselves, besides the avatar (UC-06) and the password (UC-05): the address (`users.address`, max 500 characters,
  every user, UC-107) and, for a parent, the occupation (`parents.occupation`, max 100 characters, with the Parent role
  active, UC-108). Both may be cleared. Every other field is managed by the school (SM profiles, SA login
  identifiers). Not logged.
- **Parent views a child's profile** (agreed 01/11/2026, UC-109): with the Parent role active, a parent opens the
  profile of each linked child (`student_parents`) from their own profile: personal information (name, username,
  date of birth, gender, email, phone, address, avatar, account status), student code, current class, class type,
  homeroom teacher and class nickname. Read only. Any other student → "not found" (does not reveal that the student
  exists).
- **Address lives in `users.address`** for every role (moved from `parents.address`, which no longer exists, on
  28/10/2026). Every screen that shows or edits a parent's address reads / writes `users.address`: student detail and
  linked parents (FE-02), account create / import / detail (FE-13), parent detail and UC-106 Update Parent (FE-14).
- Email optional for everyone. **Phone required for parents** (it identifies a parent with several children),
  optional for students and teachers. Email and phone are unique when present.
- **Phone format** (01/11/2026): stored as `0` + 9 digits. Everywhere a phone is typed (create, import, edit,
  lookup, sign-in, password reset request) spaces, dots and dashes are removed and a leading `+84` becomes `0`
  before checking or comparing (`server/src/utils/phone.js`).
- Password: 8–32 characters with a digit, a lowercase letter, an uppercase letter and a special character; not equal
  to the previous password; must not contain the username or phone number.
- Initial / reset password: random, shown **once** to SA/SM (on screen after creating one account or a reset; in
  the result file of an import) and never stored as text; `must_change_password = TRUE` forces a change at the next
  sign-in. In that forced change the user only types the new password twice – no need to type the temporary one
  again (01/11/2026); a normal change (UC-05) still asks for the current password. Users without email get it outside the system. Lost before handover → reset again (UC-100). The account
  list export (UC-98) has no passwords. (Exception: the encrypted copy of a password reset request, see below.)
- **Temporary sign-in lock** (automatic, different from a manual account lock): after 5 wrong passwords lock for
  5 minutes; each further group of 5 adds 5 minutes, max 30; one correct sign-in resets the counter; SM/SA can clear
  it. Values come from `system_settings`.
- Account status is only `ACTIVE` or `LOCKED`. **Accounts are never deleted – they are locked.**
- A locked teacher (even a homeroom teacher) stays in groups with a "Locked" label (from `users.status`); all SMs
  are notified; SM reassigns homeroom / subject teaching; the timetable updates; old grades stay. Without a homeroom
  teacher nobody approves that class's posts, and the class shows a warning.
- Max **2 parents per student** (check in code).
- Forgot password: 6-digit OTP by email, valid 5 minutes, stored **hashed**, invalid after 5 wrong attempts.
- **Password reset request** (agreed 27/10/2026, matching check and automatic reset 01/11/2026): a user who cannot
  use the OTP sends a request from the Forgot Password screen: sign-in name (username / email / phone) + **full
  name** + optional reason (max 500 characters). The sign-in name and the full name must belong to the same account
  (full name compared ignoring case and extra spaces) – otherwise "the details do not match"; a matching locked
  account → "account locked".
  - When they match, the **system resets the password at once**: a random temporary password replaces the old one
    (the old one stops working), `must_change_password = TRUE`, the temporary sign-in lock is cleared and unused
    OTPs expire. Logged as `PASSWORD_RESET`.
  - At most one such reset per account every `password_reset.request_cooldown_minutes` (system setting, default
    15) – earlier → "try again in N minutes".
  - Every such reset is a `password_reset_requests` row with `delivery` = `EMAIL` or `SCHOOL`, listed for SA / SM
    in the tab "waiting for sign-in" as "sent by email" or "to hand over" (the tab counter counts only the latter).
  - **Account with an email:** the temporary password is sent to that email (`delivery = EMAIL`, nothing stored, no
    notification). A new request after the cooldown replaces the waiting one (the user may not have got the email).
  - **Account without an email:** the PENDING request (`delivery = SCHOOL`) keeps an encrypted copy of the temporary
    password (`temp_password_enc`); SA (any account) and SM (student / parent / teacher accounts) are notified and
    can read the password on the requests page. How the user gets it (contacting the school, a teacher…) is outside
    the system. The request becomes DONE and the copy is cleared when the user signs in. While a request is PENDING
    a second one is refused ("a request is already waiting"), the password does not change.
  - SA / SM can still reset any time with UC-100 from the account screens.
- During **maintenance** (`maintenance_announcements` window) nobody except System Admin can sign in; users see
  "The system is under maintenance". When SA schedules maintenance, all accounts are notified and a banner shows
  beforehand.
- Auto sign-out after inactivity: **not decided yet** (JWT currently expires after 8 h).

## 4. School structure (FE-04)
- `school_years` → two `semesters` (1, 2) with status `OPEN` / `CLOSED`. SM closes a semester; closing **only ends
  attendance corrections** (it does not lock grades). SM may **reopen** a closed semester (e.g. closed by mistake),
  which gives the homeroom teacher the excused ↔ unexcused correction back (03/11/2026).
- **School years** (FE-04, agreed 03/11/2026): name `YYYY-YYYY` with consecutive years; the year starts in the first
  year of its name and ends in the second; two school years never overlap; the current year is found by date (the latest that has started; before any
  has started, the earliest); a school year that has ended is **read only** (classes, class types, groups).
- **Subjects:** the subject code is unique and is what Excel imports refer to; no two subjects share a name
  (case-insensitive).
- Classes are created **per school year** (10A1 of 2026–2027 is a different row from 10A1 of 2027–2028).
  Promotion = new enrollment in the new class; transfer = old enrollment `TRANSFERRED` + new enrollment (back to a
  class already studied in that year: its old enrollment is reopened, see Transfer below).
- **Who puts a student in a class** (agreed 03/11/2026) – one path per case, so the rules live in one place:
  - Students who studied in a class **the previous school year** go to the new year only by **promotion (UC-11,
    FE-02)**: from the school year **right before** the destination year, into a destination year that has not
    ended; to the **next grade or the same grade** (repeating a year; grade 12 can only repeat); only students still
    `STUDYING` in the source year count (a student transferred inside that year moves from the class they study in
    now); at most 200 students per call; a target class never goes over 45 studying students (the call is refused).
  - **Transfer (UC-10, FE-02)**: to another class of the **same school year and the same grade**, not once the year
    has ended, not into a full class (45). Back to a class the student already studied in that year (11D1 → 11A1 →
    11D1): the old enrollment is **reopened** (`STUDYING`, `left_at` cleared) with its grades and attendance –
    `UNIQUE (student_id, class_id)` stays (lead, 03/11/2026).
  - **Create class / import class list (UC-28, UC-27, FE-04)** only take students who were **not studying in a
    class of the previous school year** (no `STUDYING` enrollment there – the same students promotion would take)
    and are not studying in a class this year: new to the school, coming from another school, coming back after a
    year away, or left without a class there after a transfer; a row with a student of the previous year is refused
    with a message to use promotion.
  - **Leaving the school:** no separate use case. The account is **locked** (UC-101; accounts are never deleted,
    §3). Coming back during the same year: unlock; coming back in a later year: added as above.
- **Students** (FE-02, agreed 03/11/2026): date of birth gives an age of 10–30 today; SM updates name, date of
  birth, gender and **address** (`users.address`) in UC-09; username / email / phone stay System Admin only. A
  locked parent account can be linked; two parents with the same relationship are allowed (max 2 parents, §3).
- **Import parent–student links (UC-14)** works like the account import (UC-96, FE-13): a template (`.xlsx` or
  `.csv`) with columns *Mã học sinh*, *Số điện thoại phụ huynh*, *Quan hệ* (Bố / Mẹ / Người giám hộ); headers are
  matched ignoring accents, case and notes; at most 500 rows. **Preview** (no write) lists each row's errors;
  **import** checks the same file again and saves **every valid row in one transaction** – invalid rows are skipped
  and listed; no valid row → refused. Row errors: missing value, student code not found, no parent account with
  that phone (`utils/phone.js`), relationship not in the list, link already exists, the student would have more
  than 2 parents (existing links + rows of the file), the same student–parent pair twice in the file. A new link
  adds the parent to GENERAL + PARENT of the child's current class, as UC-13 does. Not logged (like UC-13).
- Every class has a **class type** (`class_tracks`, NOT NULL), e.g. type A = Maths/Physics/Chemistry focus.
  `track_subjects` holds, per school year, the subjects and **periods per week** (whole number 1–10) of that type;
  copied from the previous year by default; editable, but subjects can no longer be added or removed **once the year
  has grades** (periods per week stay editable). Removing a subject from a type hard-deletes its `track_subjects`
  row (allowed only while the year has no grades and has not ended, §14).
- A class type belongs to **one grade** (10, 11 or 12) or to **every grade** (`class_tracks.grade_level_id`, NULL =
  every grade; patch `patch_v0.3_class_track_grade.sql`, 02/11/2026), so subjects and periods can differ per grade.
  A class only uses a type of its grade or one for every grade. A name is unique per grade (case-insensitive, among
  types not deleted) and is used either for every grade or per grade, not both. A type's grade cannot change while
  classes of another grade use it.
- **Every subject weight is 1** (agreed 01/11/2026, in line with Circular 22/2021): `track_subjects.weight` is
  always 1.00 and is not shown.
- **Classes** (FE-04, agreed 03/11/2026): a class name is the grade followed by 1–8 letters or digits, no spaces or
  accents (`10A1`, `12CT`; typed names are upper-cased). A class has at most **45 studying students**, checked when
  creating a class, adding students, importing a class list, transferring (UC-10) and promoting (UC-11). UC-28 creates a class and also adds students to
  an existing class, only the students it may take (see "Who puts a student in a class"). A class list import has at most 2000 rows; a locked
  account is still imported, with a warning.
- Homeroom teacher may be empty → show a warning so SM assigns one.
- `teacher_subjects`: which subjects a teacher can teach (one teacher may teach several). Teaching assignments only
  for subjects the teacher can teach.
- **Teachers (FE-03, agreed 02/11/2026):**
  - SM updates a teacher's full name, department and subjects only; username / email / phone are System Admin only
    (UC-99). A teacher keeps **at least one subject**; a subject still used by a current or future teaching
    assignment cannot be removed.
  - **Departments** (tổ chuyên môn) come from the `departments` list; SM picks one on Update Teacher.
    `teachers.department` stores the department name (no foreign key yet).
  - **Homeroom:** one homeroom teacher per class per school year, and a teacher is homeroom teacher of **at most one
    class** per school year.
  - A **locked teacher** gets no new homeroom class and no new teaching assignment (existing ones stay until SM
    reassigns them).
  - **Teaching assignment:** one teacher per (class, subject) at a time; the subject must belong to the class type
    for that year (`track_subjects`). A change takes effect from a date **today or later** inside the school year
    (never back-dated): the running assignment ends the day before and the new one runs to the end of the year.
    Timetable periods from that date **without attendance** move to the new teacher; periods with attendance stay.
    A (class, subject) cannot be left without a teacher while it still has such periods.
- Importing a class creates 3 groups automatically: **GENERAL** (feed + chat), **STUDENT** (chat), **PARENT** (chat).
  Groups can also be created by hand. One **TEACHER_SCHOOL** group for the whole school (feed + chat, all teachers +
  SMs, managed by SM, reused across years). After promotion, last year's groups are read only.
- **Teams** (`TEAM_CHAT`): chat only, members from one class; Teachers, Students and Parents can create them
  (`groups.created_by`); SA and SM cannot.
- Student **nickname** (max 50 characters) is set by the homeroom teacher only and shown only inside that class:
  to the members of the class's groups and to the School Manager (never in the teacher group or outside the class).
- **Teams in detail** (agreed 03/11/2026): the creator picks the members when creating it – the creator plus 2–49
  others from the same class (3–50 people), no locked accounts; name 2–100 characters, not unique. After that
  **nobody adds or removes members** and a team has **no admin**. **Anyone can leave a team**, the creator too;
  when the last member leaves, the team is closed (soft-deleted). The three class groups cannot be left (membership
  follows the class). Not possible once the school year has ended.
- **Group moderator = the current homeroom teacher**, read from `classes.homeroom_teacher_id` (nothing stored per
  group), so the rights move at once when the homeroom teacher changes, posts waiting for approval included.
- **Removing members** (UC-33): the homeroom teacher removes students and parents only; teachers are removed by the
  School Manager (who also makes the teaching assignments). A teacher removed while still assigned to the class
  comes back at the next membership sync (membership follows the class); to take a teacher out, end the assignment.
- **Class group membership follows the class** (agreed 03/11/2026), in the same transaction as the change that
  causes it:
  - Transfer (UC-10) / promotion (UC-11): the student leaves every group and team of the old class and joins GENERAL
    + STUDENT of the new class; each linked parent leaves GENERAL + PARENT of the old class (unless another of their
    children still studies there) and joins GENERAL + PARENT of the new class.
  - Homeroom change (UC-19) and teaching assignment change (UC-18): teachers are kept in line with §4 – the
    homeroom teacher is in all three groups, a subject teacher (current or future assignment) in GENERAL. A teacher
    who no longer has a reason to be in a group leaves it (`left_at`): the previous homeroom teacher leaves STUDENT
    and PARENT, and also GENERAL and the class's teams unless they still teach a subject there. A teacher who is
    also the parent of a student of the class keeps the groups a parent belongs to.
  - Anyone who comes back to a group (teacher, student or parent) gets their old membership row back (`left_at`
    cleared) and sees the group's whole history. Shared function in FE-04
    `classGroups.js`; nothing changes for classes of an ended school year.

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
  student year average = average of subjects (every `track_subjects.weight` is 1, so a plain average).
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
  lifetime, password reset request cooldown, attendance edit deadline. Allowed values (01/11/2026): wrong passwords
  before a lock 3–10; lock step 1–60 min; lock max 1–1440 min; images / files 1–50 MB; videos 1–200 MB; OTP lifetime
  1–30 min; reset request cooldown 1–1440 min (default 15); attendance deadline a time `HH:MM`.
- `activity_logs` (never deleted) records only important actions: sign-in success / failure, account create /
  import / lock / unlock, password reset, role change, setting change, grade unlock. **The log is only kept in the
  database – there is no screen to view it** (UC "View Activity Log" and its screen removed 01/11/2026 on the
  supervisor's advice).

## 14. Deleting data
- **Every delete in the system is a soft delete** (`deleted_at`, often `deleted_by`): never `DELETE` business rows,
  always filter `deleted_at IS NULL`.
- Hard delete is allowed only for technical / configuration rows: `post_likes` (unlike), `class_event_viewers`,
  `teacher_subjects`, `user_roles`, `student_parents` (unlink), expired OTPs, `track_subjects` (a subject removed
  from a class type while the year has no grades, §4).
- Status changes instead of deletes: accounts (`LOCKED`), enrollments (`TRANSFERRED` / `DROPPED`), group members
  (`left_at`), activity registrations (`CANCELLED`), activities (`CANCELLED`).

## 15. Open questions (do not decide them in code – ask)
- Auto sign-out time after inactivity.
- Final cloud storage provider for files; whether attachments get a `storage_key` and short-lived links for private
  files (proposed, not confirmed).

## 16. Lists and search (agreed 03/11/2026)
- Search boxes on list screens match **"contains"**, ignoring case and Vietnamese accents ("bao" finds "Phạm Gia
  Bảo"). Every module uses the shared `server/src/utils/search.js` (SQL `translate()`, no Postgres extension, works
  on every database); `%` and `_` typed by a user are matched literally.
- Lists of people are sorted the Vietnamese way: by the given name (last word), then the rest (collation
  `vi-VN-x-icu`, `server/src/utils/nameSort.js` from FE-02).
