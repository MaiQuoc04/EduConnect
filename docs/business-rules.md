# EduConnect – business rules (agreed by the team, up to 20/10/2026)

These rules override anything you might assume from "typical" school apps. When a rule here conflicts with an
older document (Report 1–3 v1.0, old ERD images), **this file wins**. If something is not covered, ask the team
instead of inventing a rule.

The app serves **one high school** (grades 10–12). Users never self-register.

## 1. Actors and roles
| Role code | Who | Scope |
|---|---|---|
| `SYSTEM_ADMIN` | IT admin | Accounts and system only: create / import / export accounts, change login identifiers, reset passwords and lock / unlock **any** account, system settings, maintenance. **Cannot see any content** (feeds, chats, grades, school posts), is in no group, cannot create teams. |
| `SCHOOL_MANAGER` | Principal / office staff (several, equal rights) | All school business. Views and updates student / parent / teacher profiles (cannot create or delete them, except importing teacher accounts, UC-116, §4). Resets passwords and locks / unlocks student, parent and teacher accounts. Manages the **school-wide teacher group** (pin / hide / approve) and the school feed. **Does not see class feeds or class chats.** Private messages only with people in the teacher group. Views grades and rankings of the whole school (read only), unlocks grades, views grade history, corrects attendance after the day, sees school-wide attendance statistics. |
| `TEACHER` | Teachers | Teaches assigned classes / subjects. A teacher becomes **Homeroom Teacher** of a class when `classes.homeroom_teacher_id` points to them – this is **not a separate role**. |
| `STUDENT` | Students | Own data, own classes and groups. |
| `PARENT` | Parents / guardians | Their children's data; picks a child first on child-specific screens. |

- One account can have **several roles** (`user_roles`). The header has a **role switcher**; permissions follow the
  **active role** (`req.user.activeRole`), never the union of roles.
- `SYSTEM_ADMIN` and `STUDENT` are **exclusive**: an account with one of them has no other role. Other roles combine
  freely (e.g. Teacher + Parent, School Manager + Teacher). Check this in code when assigning roles.
- **How a second role is given (24/11/2026, Linh, option 2):** an account is created (UC-95) or imported (UC-96) with
  **one** role – the role of the page or file; `POST /admin/accounts` refuses two roles (`ONE_ROLE`). A combinable
  role is **added afterwards** with "Thêm vai trò" (`POST /admin/accounts/:id/roles`, UC id pending): System Admin on
  Account Detail (SCR-60) adds Teacher, Parent or School Manager; School Manager on the teacher / parent detail page
  adds Teacher or Parent to a teacher / parent account (not to an account that has the School Manager role). The new
  role's profile is created in the same transaction with the UC-95 rules: Teacher = teacher code (required, unique) +
  department; Parent = occupation, and a phone number when the account has none (required for a parent, unique);
  Teacher / School Manager join the school teacher group (§4). Logged as `ROLE_CHANGE`. Roles are **never removed**
  (`user_roles` has no soft delete). The user sees the new role in the role switcher after the next sign-in.
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
- **Who manages accounts (23/11/2026, supervisor's request):** the School Manager manages student, teacher and parent
  accounts day to day – create one by one or from a file, export, edit email and phone, reset password, lock / unlock –
  from their student, teacher and parent lists, with FE-13's pages and checks. System Admin can do the same on its own
  account pages, helps when needed and is the only one who manages School Manager and System Admin accounts (System
  Admin accounts are never created from the UI: `npm run seed:admin`). Usernames are changed by System Admin only.
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
- A class type belongs to **one grade** (10, 11 or 12) (`class_tracks.grade_level_id`; patch
  `patch_v0.3_class_track_grade.sql`, 02/11/2026), so subjects and periods can differ per grade. Creating a type
  needs at least one grade (one type per chosen grade). Since 20/11/2026 there is **no "every grade" type** (SCR-70
  has no "Mọi khối" tab): `patch_v0.3_class_track_split_all_grades.sql` split the old ones into one type per grade
  (subjects copied, each class moved to the type of its grade); the column stays nullable only for deleted old rows.
  SCR-70 hides "Thêm loại lớp" while the selected school year has grades (20/11/2026, UI only: a type is not tied
  to a year). A class only uses a type of its grade. A name is unique per grade (case-insensitive, among types not deleted). A
  type's grade cannot change while classes of another grade use it.
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
  - **Managing departments (UC-114, agreed with the lead 07/11/2026):** SM creates, renames and deletes departments
    on the Departments screen and chooses the subjects of each one (`department_subjects`). A subject belongs to
    **at most one department**; a subject of no department (e.g. HĐTN, taught by homeroom teachers) can be taught by
    a teacher of any department. Names are unique ignoring case, accents and the kind of dash; a rename is copied to
    `teachers.department` of its teachers. A department that still has teachers cannot be deleted (move them first);
    deleting it (soft delete) makes its subjects subjects of no department. Starting list: Tổ Toán – Khoa học tự nhiên
    (Toán, Lí, Hoá, Sinh, Tin, CN), Tổ Ngữ văn – Khoa học xã hội (Văn, Sử, Địa, KTPL), Tổ Ngoại ngữ – Thể chất (Anh,
    GDTC, QPAN).
  - **Subjects follow the department (UC-17, 07/11/2026):** a subject **added** to a teacher must belong to the
    teacher's department or to no department (no department chosen → only subjects of no department). Subjects the
    teacher already has stay even if they are outside the department (shown with a warning); SM removes them when
    needed.
  - **Import teachers (UC-116, 07/11/2026):** SM imports teacher accounts from a file – the same template, checks,
    preview and one-time passwords as UC-96 (FE-13), account type fixed to Teacher. The department column must name a
    department of the list (case, accents and dash type ignored) or stay empty; subjects are set later on UC-17.
  - **Export the teacher list (UC-115, 07/11/2026):** SM downloads the list with the filters of the screen (all
    pages, max 5000 rows) as .xlsx: code, name, department, subjects, email, phone, homeroom class, classes,
    periods/week, status.
  - **Homeroom:** one homeroom teacher per class per school year, and a teacher is homeroom teacher of **at most one
    class** per school year.
  - A **locked teacher** gets no new homeroom class and no new teaching assignment (existing ones stay until SM
    reassigns them).
  - **Teaching assignment:** one teacher per (class, subject) at a time; the subject must belong to the class type
    for that year (`track_subjects`). **Each assignment has a start and an end date** (changed 07/11/2026, agreed
    with the lead): SM chooses the range [start, end] (start **today or later**, never back-dated; end defaults to the
    end of the school year). Only the part of other assignments inside the range changes and **history is kept**:
    an assignment that covers the whole range is split (A runs 05/09–31/05, B is assigned for 01/12–15/12 → A
    05/09–30/11, B 01/12–15/12, A 16/12–31/05), one that starts before ends the day before, plans inside the range
    are replaced (soft delete). Two touching assignments of the same
    teacher are joined. Timetable periods **inside the range without attendance** move to the new teacher; periods
    with attendance stay. A (class, subject) cannot be left without a teacher in a range that still has such
    periods.
  - **Search on SCR-19 (18/11/2026):** the search box finds a class (name) or a teacher (whole name word first, else
    the start of a name word, or part of the code; accents ignored). A teacher match shows only the classes where
    that teacher is assigned in the range on screen, only the columns of their subjects, and highlights their cells.
  - **Viewing assignments by range (SCR-19):** SM picks "from" and "to"; each (class, subject) lists every teacher
    whose assignment overlaps the range, with its start and end dates (01/01–31/05 shows only A, 01/06–31/12 only
    B, 01/01–31/12 both). Changes are made for the range on screen and only when it starts today or later.
- Importing a class creates 3 groups automatically: **GENERAL** (feed + chat), **STUDENT** (chat), **PARENT** (chat).
  Groups can also be created by hand. One **TEACHER_SCHOOL** group for the whole school (feed + chat, all teachers +
  SMs, managed by SM, reused across years). After promotion, last year's groups are read only.
  A new Teacher or School Manager account joins every active TEACHER_SCHOOL group in the same transaction, whether
  created (UC-95), imported by SA (UC-96) or imported by SM (UC-116); if the group does not exist yet nothing is
  added (FE-13, 17/11/2026).
- **Teams** (`TEAM_CHAT`): chat only, members from one class, or teachers of the school ("teacher team", below);
  Teachers, Students and Parents can create them
  (`groups.created_by`); SA and SM cannot.
- Student **nickname** (max 50 characters) is set by the homeroom teacher only and shown only inside that class:
  to the members of the class's groups and to the School Manager (never in the teacher group or outside the class).
- **Teams in detail** (agreed 03/11/2026): the creator picks the members when creating it – the creator plus 2–49
  others from the same class (3–50 people), no locked accounts; name 2–100 characters, not unique. After that
  **only the leader adds and removes members** (Khanh's decision 17/11/2026, replaces "nobody adds or removes
  members"): people of the team's class (a teacher team: teachers of the teacher group), active accounts, up to 50; a
  removed member loses the team at once and can be added again (then sees the whole history, §6); the leader cannot
  remove themselves (they leave). Lines "A đã thêm B vào nhóm" / "A đã xoá B khỏi nhóm". **Team leader** (agreed by the lead 15/11/2026, replaces "a team has no admin"):
  the creator is the leader (`groups.leader_id`); the leader's only rights are to **hand the leadership over** to
  another member (any time) and the duty to do so **before leaving while others remain** (a locked member may be
  chosen, with a warning). When the system takes the leader out (transfer, promotion, assignment change), the member
  who joined first and is still in becomes leader. **Any member can rename the team** (same name rules).
  **Anyone can leave a team**; when the last member leaves, the team is closed (soft-deleted) and leaves every list.
  **System lines** in the team chat (`messages.message_type = 'SYSTEM'`): "A đã tạo nhóm", "A đã đổi tên nhóm thành …",
  "A đã rời nhóm", "A không còn trong nhóm" (taken out by a class change), "A đã chuyển quyền trưởng nhóm cho B". They
  count as unread and move the chat up like a message, but cannot be answered, reacted to or deleted. The three class groups cannot be left (membership
  follows the class). Not possible once the school year has ended.
- **Teacher teams** (agreed by the lead 05/11/2026, e.g. a head of department with the department's teachers): a team
  with no class (`class_id` NULL), created by a teacher (active role) who is in the teacher group. Members are
  picked from the teachers of the teacher group, whatever their class; School Managers cannot be picked, cannot create
  one and do not see it. Same size, name, leave and leader rules as above (the leader adds teachers of the teacher group). It has no school year, so it never
  becomes read only. A teacher whose account is locked later stays in it with the "Locked" label.
- **Group moderator = the current homeroom teacher**, read from `classes.homeroom_teacher_id` (nothing stored per
  group), so the rights move at once when the homeroom teacher changes, posts waiting for approval included.
- **Class group members** (UC-32 / UC-33, Khanh's decision 17/11/2026, replaces "the homeroom teacher removes students
  and parents, the School Manager removes teachers"): **nobody removes anyone** from the three class groups – their
  members follow the class (transfer, promotion, teaching and homeroom assignments, below). Only the **School
  Manager adds** people of the class who are missing (e.g. a student who transferred in before the sync); the
  homeroom teacher can no longer add or remove. To take a teacher out, end the assignment.
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
    cleared) and sees the group's whole history, feed and chat, except chat messages they deleted for themselves (§6).
    Shared function in FE-04
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
- **Comment likes and reports** (Khanh's decision 19/11/2026, the same as the school feed, §8 / FE-08 17/11/2026):
  - A comment can be **liked** (one per person, again = unlike) by whoever may interact with the post (a live post of
    an open school year); not on a hidden, pending or last year's post. No notification.
  - A comment can be **reported** (reason: inappropriate language, harassment, spam, false information, other – a
    note is required for "other", ≤ 500 characters) by whoever may interact with the post, **except the group's
    moderator**, who deletes comments directly. **The moderator's own comments cannot be reported** (option A, Khanh
    19/11/2026: the report would land in their own queue; a complaint about the homeroom teacher, or a School Manager in
    the teacher group, goes to the school directly). Not one's own comment; once per person (again changes nothing). A
    report hides nothing (comments are deleted, never hidden). **Nobody learns who reported**, the moderator neither.
  - **"Báo cáo bình luận nhóm"** (menu, `/group-comment-reports`): the moderator's queue – the homeroom teacher sees
    the comments reported in their class's feed, the School Manager those of the teacher group (never a school post:
    that queue is FE-08's "Báo cáo bình luận"). One card per comment with the number of reports, the reasons and
    notes, the group and the post. **Xoá bình luận** deletes it (soft) and closes its reports; its author gets a
    personal notification that names nobody. **Bỏ qua** keeps it and closes the reports. A comment deleted from the
    thread (author, post author, moderator) closes its pending reports too. Tabs: waiting, deleted, dismissed. No
    notification to the moderator when a report arrives (as the school feed today).
- Images, files and videos can be attached to posts and messages: images / files ≤ 10 MB, video ≤ 50 MB.
  Files live in cloud storage; the DB stores the URL (`attachments`).
- **Post states in detail** (Khanh's proposals, agreed by the lead 11/11/2026):
  - **Moderator posts are auto-approved:** the homeroom teacher in the class feed, the School Manager in the teacher
    group. Any post is also approved at once when the group has `require_approval = false`.
  - **Rejected** (`REJECTED`): seen only by its author (label "Đã bị từ chối") and the group moderator; no reason is
    stored. The author may edit it – saving sends it back to `PENDING` – or delete it.
  - **Editing an approved post** while the group has `require_approval = true` (author not the moderator) sends it
    back to `PENDING`: it leaves the feed until the moderator approves it again. With approval off it stays
    `APPROVED` and shows "Đã chỉnh sửa" (`updated_at`).
  - **Hidden** (`is_hidden`): the author still sees it, labelled "Bài viết đã bị ẩn bởi người kiểm duyệt"; other
    members do not. The moderator sees the list of hidden posts and can **unhide** one (it comes back as a normal
    post). Only posts are hidden; comments are still only deleted.
    The author may **edit a hidden post** (agreed by the lead 12/11/2026): saving unhides it and sends it to `PENDING`
    **even when the group has approval off**, so it comes back to the feed only when the moderator approves it (a
    moderator editing their own hidden post: approved at once). Saving without any change keeps it hidden.
  - **Feed order** (Khanh, 12/11/2026): pinned posts first, then newest first by posting time. A post **edited and
    sent again** (hidden, rejected, or approved then edited while approval is on) that the moderator approves again
    **counts as a new post**: its posting time becomes the time of that approval (top of the feed, today's time) and
    it no longer shows "Đã chỉnh sửa"; its likes and comments stay. A first approval, unhiding without an edit and an
    edit with approval off keep the post's time and place. The pending queue is first sent, first shown (an edited
    post counts from when it was sent again).
  - **Pin:** at most **5 pinned posts per group**; pinning a 6th is refused ("Đã đạt giới hạn 5 bài ghim. Vui lòng
    bỏ ghim bài cũ trước khi ghim bài mới."). Hiding a post unpins it; unhiding does not pin it again.
  - **Turning approval on / off** (`groups.require_approval`): the homeroom teacher for the class general group, the
    School Manager for the teacher group, with a switch on the group detail screen (SCR-21); no new screen. The School
    Manager still does not see class feeds (§2).
  - **Class without a homeroom teacher** (none assigned, or locked): the class feed shows a banner "Lớp học hiện chưa
    có GVCN phụ trách kiểm duyệt. Bài viết chờ duyệt có thể bị xử lý chậm."; pending posts wait until the School
    Manager assigns a homeroom teacher (UC-19), who then takes them over. Nobody approves in place of the homeroom
    teacher.
  - **Lengths:** post content at most 5,000 characters; comments at most 2,000 (as FE-08). Group posts have no title.

## 6. Messaging (FE-06)
- Group chats (GENERAL / STUDENT / PARENT / TEACHER_SCHOOL / TEAM_CHAT) and **1-1 chats**. A 1-1 chat is a group of
  type `DIRECT` with 2 members and `direct_key = "<smallerUserId>_<largerUserId>"` (unique → never two chats for the
  same pair). Every message has a `group_id`.
- Private messages only with people in one's own classes (SM: within the teacher group). Chat screens show nobody's
  phone or email (Khanh 07/11/2026); teachers and SM see them on the group member list (§4, UC-31).
- **1-1 chats and sending** (Khanh's proposals 04–05/11, accepted by the lead 07/11/2026):
  - Who one may write to follows the **active role**; a teacher may also write to the members of the teacher group
    (teachers and School Managers).
  - A 1-1 chat is listed under every role of its two members (never System Admin); sending is checked with the
    active role. It is not listed for anyone until it has a message.
  - When the two are no longer in reach (transfer, promotion, assignment ended), the old 1-1 chat stays readable and
    sending is closed. Locked accounts are not offered and cannot be written to; their old chats stay readable.
  - 1-1 chats show full names, never the class nickname.
  - A message has at most 2000 characters. Messages cannot be edited (deleting: UC-113, below). No `CHAT`
    notifications (lead, 18/11/2026: the chat list already shows unread messages).
  - A student who transfers back to a class does not rejoin its teams (only GENERAL + STUDENT); the old team's chat
    stays closed to them and they can create a new team.
- **Chat history starts at the first joining** (04/11/2026): in every chat (group, team, teacher group, 1-1) a
  first-time member (e.g. a student who transfers in) sees only the messages sent since they joined. Someone who
  comes back sees the whole history again, the time they were away included (§4): what counts is their earliest
  `joined_at` in that group, whichever way they came back. The last message and the unread count of the conversation
  list follow the same rule. **Chat only:** the group feed (FE-05) always shows its whole history.
- Read receipts: `group_members.last_read_at`; "seen by" = members whose `last_read_at ≥ message.sent_at` (and
  who had first joined by then, earliest `joined_at ≤ message.sent_at`).
- Removing a member / transferring a student sets `group_members.left_at` (row is kept).
- **Reply, reactions, emoji, delete** (agreed by the lead 07/11/2026; UC-110..UC-113):
  - **Reply:** one level, to a message of the same chat the sender can see and that is not deleted for everyone. The
    quote is read from the original when shown. Someone who joined after the original sees only "message from before
    you joined", nothing of it. Clicking a quote goes to the original.
  - **Reactions:** fixed set of 6 (like, love, haha, wow, sad, thanks; "Only Like" in §5 is for the feed); one per person
    per message, another one replaces it, the same one removes it. They do not count as unread or move the chat up.
  - **Emoji:** the system's own emoji in the text; no stickers.
  - **Delete for everyone:** own message only, within `chat.delete_for_everyone_minutes` (default 15, from sending).
    It stays as "Tin nhắn đã được xoá" ("Bạn đã xoá một tin nhắn" for the sender) with its reactions and attachments
    hidden, and cannot be answered, reacted to **or deleted again** – not even "for me"
    (Khanh's decision 15/11/2026: it is already gone for everybody). The database keeps the content; the API never
    returns it and no screen shows it.
    **The deletion is shown like a new message** (Khanh's decision 15/11/2026): the other members' conversation list
    shows "<name> đã xoá một tin nhắn" as the preview (bold), counts it as one unread (the message itself is not
    counted again), uses the deletion time, and a 1-1 chat moves to the top. Seeing the open chat clears it.
  - **Delete for me:** any message one can see that is not deleted for everyone, no time limit; others see no change. It stays hidden after leaving a
    group and coming back. It leaves nothing behind – no "Bạn đã xoá một tin nhắn" line, not in the chat and not in the
    list (15/11/2026): the preview falls back to the last ordinary message still visible (a deleted-for-everyone line
    older than one's latest delete-for-me is skipped); a 1-1 chat with none left drops
    off the list until a new message arrives.
  - Neither can be undone. In an ended school year or a closed 1-1 chat only delete for me is possible. Group moderators
    cannot delete other people's messages.
- **Sending, drafts, connection** (Khanh's decisions 17/11/2026; the database part approved by the lead 17/11/2026):
  - **Sending:** a message shows at once, dim with "Đang gửi…", and messages are sent one after another in the order
    they were written. The text is stored in Unicode NFC. Over 2000 characters the "Gửi" button is off (pasting more is
    allowed, the counter turns red). A picture pasted together with text attaches the picture and keeps the text.
  - **No answer:** sending waits 15 s, loading 20 s. A message that failed stays with its reason and "Thử lại" (when
    sending again can help), "Sửa" (back into the box) and "Xoá" (drops only this unsent copy). With no answer at all
    it says "Chưa rõ đã gửi được chưa": the server may have saved it.
  - **Never twice:** each message carries a random id (`messages.client_message_id`, UUID). Sending the same id again
    in the same chat returns the saved message instead of a copy, so "Thử lại" is always safe. Only the sender sees
    the id. **Database: `patch_v0.3_message_client_id.sql` – approved by the lead and run on the shared database
    17/11/2026.** (Without the column the server still works, only without this protection.)
  - **Drafts:** per account and chat, in the browser only (not across devices): the text, the message being answered,
    the files already uploaded and the unsent messages. Kept 7 days. Sending clears it. The conversation list shows
    "Bản nháp: …" for a chat that is not open and has nothing unread.
  - **Connection:** after 3 s without the real-time connection the chat says "Mất kết nối…" and "Đã kết nối lại" when
    it is back. Sending still works meanwhile. On every reconnection the chat reads what it missed (the messages after
    the last one shown, plus the latest page for deletions and reactions) without losing the older messages already
    loaded or the reading position; more than 100 missed → the latest page is shown again. A failed catch-up keeps
    the chat as it is and tries again (up to every 30 s).
  - **Reading:** new messages never pull a reader who is looking at older ones down; "↓ n tin nhắn mới" does. A chat
    counts as read only when its end is on screen in a visible tab. My own messages from another tab or device do not
    move the list either.
  - **Losing access while the chat is open:** someone taken out of a group (teams, and – 17/11/2026 – a teacher whose
    assignment ended: class groups) sees it leave the list and its chat close at once; the members' counts and the
    1-1 chats of those people are read again (may they still write?). Sent only once the change is saved. A sending
    attempt refused because the user may no longer write (read-only year, 1-1 out of reach, account locked, no longer
    a member) closes the box with the reason. ASSUMPTION / not done (other owners' modules): real-time signals when
    an account is locked, a school year ends or a student is transferred out of a class group.
- **Unread badge and hiding a conversation** (Khanh 20/11/2026; UC-132 and its database column approved by the lead 20/11/2026):
  - **Badge:** the menu item "Trò chuyện" shows the total of the unread counts of the conversation list ("99+" above
    99), kept up to date in real time; on a phone a dot on the menu button. Hidden chats are not counted.
  - **Hide (UC-132):** only a **1-1 chat or a team**; the class groups (GENERAL / STUDENT / PARENT) and the teacher group
    cannot be hidden. "⋯" on the row → "Ẩn cuộc trò chuyện", no confirmation; a toast with "Hoàn tác" (5 s). Per
    account, so under every role. Nobody else sees a change, no system line, no notification, not logged; the read
    state is not touched (the others do not see it as read), and nothing is deleted. A team leader who hides the team
    stays leader. "Nhóm của tôi" still lists the team.
  - **It comes back by itself** when anything newer than the hiding happens in it: a message from anyone (mine too,
    from any tab or device), a delete for everyone, a team system line. Reactions and my "delete for me" do not bring
    it back. It comes back with all its unread messages, the old ones included.
  - The open chat stays listed while it is open (e.g. found through the search box) and leaves the list when the user
    moves on without writing; hiding the open chat closes it. While searching, hidden chats are listed too.
  - **Database:** `group_members.hidden_at` (`patch_v0.3_conversation_hidden.sql`, **approved by the lead and run on the
    shared database 20/11/2026**). "Hidden" is worked out when the list is read (hidden_at newer than the chat's latest
    activity), so sending a message writes nothing more. Without the column the list shows every chat and hiding
    answers MSG_CHAT_HIDE_UNAVAILABLE.

## 7. Extracurricular activities (FE-07)
- The homeroom teacher posts an activity in the class feed (a `posts` row + `extracurricular_events` row) with a
  registration deadline and an optional capacity (NULL = unlimited; full = registration blocked).
- **Parents** register / cancel their child before the deadline (either parent; one registration row per student,
  re-registering reuses the row). Students do not register themselves.
- The homeroom teacher views and exports the registration list (Excel) and can cancel the activity (registered
  parents are notified).
- **As built (FE-07, Dung, 12/11/2026 – ASSUMPTIONs marked, waiting for the lead):**
  - An activity = an `APPROVED` post in the class feed (GENERAL group; its text = the description, ≤ 5,000 characters as
    §5) + an `extracurricular_events` row with a **title** (new column, `patch_v0.3_activity_title.sql`, proposed),
    place, start, optional end (may be another day), registration deadline and optional capacity (1–1000,
    ASSUMPTION). Title ≤ 120 characters (ASSUMPTION, Stitch form). No cover image or cost field: the cost goes in the
    description (ASSUMPTION; group posts have no attachments yet).
  - Managed by the class's **current** homeroom teacher (active role TEACHER), also activities posted by the previous
    one. Start and deadline in the future, deadline ≤ start, the whole activity inside the class's school year; an
    ended year is read only.
  - **Update** while `OPEN` and not started; stale save → 409 `MSG_ACTIVITY_CHANGED`; capacity never below the number
    registered; a deadline that already passed may stay (registration stays closed) or be moved to the future
    (registration reopens). Changing time, place or deadline notifies the registered children's parents.
  - **Cancel** while `OPEN` and not started: status `CANCELLED`, the post stays in the feed marked "Đã huỷ",
    registrations are kept as they were; parents of registered children are notified. No delete.
  - FE-05 edit / delete of an activity's post → 409 `MSG_POST_IS_ACTIVITY` (use the activity screens); the moderator
    may still pin or hide it. A hidden activity is seen only by the homeroom teacher (as a hidden post) – parents can
    neither see nor register.
  - **Who sees an activity:** whoever sees its post in the class feed (FE-04 group scope + FE-05 live rule), so subject
    teachers of the class see it too (read only, ASSUMPTION – permissions note 5 only lists the homeroom teacher). The
    "Ngoại khoá" list: homeroom classes (teacher), own class (student), children's classes (parent).
  - **Register / cancel** (parent, active role PARENT): own child studying (`STUDYING`) in the class, activity `OPEN`,
    now ≤ deadline, year open. Capacity counts registered children still studying in the class (ASSUMPTION); the
    capacity check locks the activity row so two parents cannot take the last place. Students only look.
  - **Registration list / export** (homeroom): every child studying in the class with status Registered / Cancelled /
    Not registered, plus children who registered and left the class (shown, not counted). Search name, student code,
    parent name; the Excel file follows the chosen filter. Parent phone numbers are shown to the teacher only.
  - **Notifications** (personal, until FE-09): new activity → parents (with the child) and students of the class;
    change of time / place / deadline and cancel → parents of registered children; **deadline reminder** → parents of
    children not registered, once, within the last 24 h, for activities posted at least a day before the deadline:
    `sendActivityDeadlineReminders()` in `modules/extracurricular/extracurricular.reminders.js`, to be called by
    FE-09's scheduled job (UC-69, Quoc).
  - **Links with the class feed (13/11/2026, Dung's request):** the homeroom teacher can start a new activity from the
    class feed (panel "Hoạt động ngoại khoá" in the right column, shown to the feed's moderator only, not in an ended year);
    the form always shows the homeroom class (a choice when the teacher has several homeroom classes in open years)
    with a link to that class feed; the "Ngoại khoá" list and the activity detail link to the class feed and to the
    activity's post.

## 8. School feed (FE-08)
- Only SM posts. Two post types:
  - **ANNOUNCEMENT**: audience must be chosen (grades and/or classes), can be liked and commented on, can be pinned,
    sends a notification by default.
  - **NEWS**: view only (no likes / comments), whole school by default, not pinned, no notification by default.
- No audience rows = whole school; choosing grade levels sends notifications to those grades only.
- **Names on screen (18/11/2026, lead):** ANNOUNCEMENT is shown as **"Bài đăng"**, NEWS as "Tin tức"; the word
  "Thông báo" is kept for notifications (bell / personal page, §9). The school feed has **two tabs, Bài đăng and Tin
  tức** (Bài đăng first, the default); there is no mixed "Tất cả" tab. Code values (`ANNOUNCEMENT`) do not change.
- SM can delete any comment on announcements; users can delete their own.

## 9. Notifications (FE-09)
- **General** notifications (bell): short, cover everything (new posts, school news, events…); clicking opens the
  source item (`target_type` + `target_id`).
- **Personal** notifications (`is_personal = TRUE`): important items with more detail (absence, class event
  tomorrow, activity registration opened / deadline / cancelled…), shown on the personal notifications page; parents
  can filter by child (`notification_recipients.student_id`).
- Storage: content once in `notifications`, **one row per recipient** in `notification_recipients` (`read_at`).
- The teacher who created a class event or an extracurricular activity can see **who has not read** its
  notifications (UC-68), to remind them. School announcements are general news: no read status, also not for SM
  (lead, 18/11/2026).
- **FE-09 decisions (18/11/2026, lead):** the bell lists every notification (title only, unread count of all); the
  personal page lists only `is_personal` ones with their detail and a child filter for parents; reading it in either
  place marks it read. No `CHAT` notifications (§6). A parent with two children in the same class gets one
  extracurricular notification carrying the first child (`student_id`), so the child filter may miss it for the
  second child: accepted.
- **FE-09 details (18/11/2026, lead):**
  - **Per role:** each `notification_recipients` row is for ONE role (`role_code`, `patch_v0.3_notification_roles.sql`);
    a user sees, counts and reads only the rows of the active role (no merging of roles). The sender gives the role
    the person is reached under: student → STUDENT, parent → PARENT, teacher → TEACHER, school post → each role of
    the user that is in the post's audience, maintenance → every role of the account, reset request → SYSTEM_ADMIN /
    SCHOOL_MANAGER, locked teacher → SCHOOL_MANAGER. "Your comment was deleted" goes to every role of the author but
    SYSTEM_ADMIN (a comment does not store the role it was written under).
  - **Never to yourself (18/11/2026, lead):** the author of a post (school post, news, group post) is never notified of
    their own post; other School Managers still get a school post.
  - **Group feed posts (18/11/2026, lead):** a general notification (`GROUP_POST`, opens the post in the group feed
    pop-up) to every active member of the group but the author, when the post becomes visible: created by the
    moderator or with approval off, or approved by the moderator (an edited post approved again counts as new). A
    pending post, an edit or a rejection sends nothing. Roles follow FE-04's group access (`groupScopeSql`); School
    Managers only in the teacher group. A post that is hidden, not approved or deleted no longer lists its
    notifications.
  - **Approval notices (18/11/2026, lead), personal:**
    - *Waiting for approval* → the moderator (homeroom teacher for the class group, every School Manager for the
      teacher group), when a post is created pending or edited back to pending; it opens the post (approve / reject
      there) and disappears once the post is approved, rejected or deleted.
    - *Approved* / *not approved* → the author (under each role with which they see the group), when the moderator
      decides; a rejected post can be edited from "Bài của tôi" and is sent for approval again.
    - A post that comes onto the feed by an edit (approval off, or the moderator's own post) notifies the members as a
      new post.
  - **Order:** newest first, no priority groups. SCR-04 has two tabs, "Quan trọng" (personal, default) and "Tất cả";
    "Chỉ chưa đọc"; parents filter by child; "Đánh dấu đã đọc tất cả" marks what the open list shows.
  - **Click:** marks the row read and opens the item (school post / group post in its pop-up, class event, activity,
    attendance of that child and month, reset request queue, teaching assignments); maintenance has no page.
  - **Deleted item:** a notification whose item was deleted (school post, group post, class event, activity post,
    maintenance window) is no longer listed after a reload; before the reload a click opens the item's page, which
    says it no longer exists.
  - **Real time:** a trigger sends `NOTIFY` on commit; the server LISTENs and pushes `notification:new` to the
    user's room with the role; nothing is pushed for a rolled-back write. The badge also reloads when the socket
    reconnects.
  - **UC-69:** the server runs the class event and activity deadline reminders every hour (first run 1 minute after
    start); `REMINDER_JOB=off` in `.env` stops it on that server (no screen; reminders never send twice).
  - **UC-68:** page "Thông báo đã gửi" (teacher): every notification about the teacher's class events and activities
    (creation, reminder, change, cancel) with read / total and the people who have not read, unread first, with their
    role, child and phone (ASSUMPTION: phone shown so the teacher can call, as on the FE-07 registration list).
- Parents **and the student** are notified when the student's attendance is anything other than "present", and
  on every later change of it (details in §12, 18/11/2026).

## 10. Timetable and class calendar (FE-10)
- SM enters or imports a **weekly pattern** per class plus a date range; the system generates **one
  `timetable_slots` row per period per day**. Changing the timetable from date X regenerates rows from X; rows that
  already have attendance are kept.
- The DB blocks clashes: one class or one teacher cannot have two lessons in the same period of the same day.
- **No substitute teaching**: the timetable teacher must match the teaching assignment.
- Teachers' teaching schedules are built automatically; parents pick a child to view a timetable.
- **How it is stored (10/11/2026, FE-10, agreed with the lead):** a class timetable is a **version** (`timetables`:
  class, start date, end date) holding a **weekly pattern** (`timetable_entries`: weekday + period → subject + room).
  The teacher is not stored in the pattern: each generated period takes the teacher whose teaching assignment covers
  that date (§4), so a teaching change automatically changes the teacher of later periods.
  - Create / update (UC-71, UC-73): SM chooses the range [start, end] (start **today or later**, end defaults to the
    end of the school year). Only the range changes: a version running before it ends the day before, one inside it
    is replaced, one running past it keeps its part after `end` (split). Periods of the range **without attendance**
    are deleted and generated again; periods with attendance stay (a new period is not placed on top of them).
  - **History (17/11/2026, Dung):** nothing of an old timetable is lost when a new one is saved (manual save, import
    or automatic scheduling). A version row is never edited in place: the version that overlaps the new range is
    soft-deleted (`deleted_at` = time of the save) and the parts that stay in force are inserted again with the same
    pattern, creator and `created_at`. So rows of a class with the same `created_at` are one saved timetable (its
    first row keeps the range and pattern as saved), and a row deleted at time T was replaced by the save of the
    same class created at T. No schema change. Periods already held (before the start of a save) are never touched.
    Screen: "Lịch sử" on SCR-27 / "Xem toàn bộ lịch sử" in the editor – `/timetables/classes/:classId/history`
    (School Manager): every save with who / when, dates still in force, what replaced which dates, periods held and
    with attendance, the weekly pattern (cells changed from the replaced timetable highlighted) and a CSV export.
    Versions trimmed before 17/11/2026 only show the part left.
  - Saving the same pattern for exactly the same dates as the version in force changes nothing (`unchanged: true`,
    no new history entry); the editor keeps "Lưu" disabled until something changes. Automatic scheduling and import
    always save (they also regenerate the periods). The apply dialog of automatic scheduling says that days before
    its start date (also the past days of the current week) keep the old timetable.
  - Signed in as a teacher (18/11/2026): in a class timetable the teacher's own lessons are coloured green with
    "Bạn dạy" and the legend counts them for the week (`mine` / `myLessons` of the week API, worked out on the
    server from the signed-in account). In the teaching schedule every lesson is theirs, so all are coloured.
  - **Teacher schedule lookup (18/11/2026):** on the teaching assignment screen (SCR-19) the School Manager opens "Tra
    lịch dạy giáo viên", types a name, teacher code, department or subject and sees that teacher's teaching schedule
    week by week (same lessons as SCR-57; `GET /timetables/teachers/:teacherId/week`, School Manager only).
  - **Finding the lessons (18/11/2026):** "Lịch dạy" (and the lookup above) shows "Lịch dạy sắp tới" – per class and
    subject the lessons from today (first / last date, periods a week, how many left) and the dates of teaching
    assignments whose class has no timetable yet (e.g. semester II). Opened on a week without lessons, it jumps once to
    the first week with lessons (with "Về tuần này"); an empty week offers "Tuần có tiết trước / tiếp theo".
  - Saving is refused (nothing changes) when a subject has **no assigned teacher** on some dates of the range, or a
    teacher would teach **two classes in the same period**; the answer lists the dates / periods.
  - Two School Managers on the same class: a save made from an editor opened before someone else's save is refused
    (`MSG_TIMETABLE_STALE`, reload first). An empty pattern is allowed and removes the periods without attendance of
    the range (the screen asks first). A school year that has ended is read only (no create / update / import).
  - Subjects must be subjects of the class type for that year (`track_subjects`); one subject per period. The number
    of periods per subject is shown against `track_subjects.periods_per_week` but not enforced (ASSUMPTION).
  - ASSUMPTION: lessons are Monday–Saturday (no Sunday); periods come from `time_slots`; no holiday calendar yet –
    SM shortens the range or changes the pattern for a holiday week.
  - Import (UC-72): one .xlsx, one row per lesson (class, weekday 2–7, period, subject code or name, room) for one or
    more classes, with one range chosen on the screen. Checked row by row and class by class (same rules as above,
    clashes between classes of the same file included); **all classes are saved or none**.
  - Viewing (UC-74): SM any class; teacher the homeroom class and classes they are assigned to; student own class;
    parent the classes of linked children (picks a child first). Teaching schedule (UC-75): the teacher's own
    periods. Week view, one day at a time on phones; a period opens its detail (time, room, teacher, attendance).
- **Class events** (e.g. 15-minute test, parent meeting): a subject teacher creates events for their own subject;
  the homeroom teacher can also create general events (`subject_id` NULL). Category from a fixed list
  (`event_categories`: Test, Assignment deadline, Parent meeting, Class meeting, Other – no UI to edit it).
- Audience: homeroom teacher and creator always see it; the creator ticks groups (all students / all parents / all
  subject teachers of the class) **and/or** picks specific people (`class_event_viewers`).
- Events appear automatically in the viewers' day calendar – there is **no "add to timetable" button**.
- One reminder **1 day before** the event (`class_events.reminded_at`; cleared when the time changes; events created
  less than a day ahead get no reminder). Only the creator updates / deletes an event.
- **Class calendar as built (FE-10, Dung, 10/11/2026 – the ASSUMPTION items wait for the lead):**
  - Who sees an event, by active role: teacher – creator, homeroom teacher of the class, subject teachers of the class
    when "all subject teachers" is ticked (a teaching assignment in the class on the event's day), people picked one
    by one; student – students **studying** in the class when "all students" is ticked, or picked; parent – parents of
    a child studying in the class when "all parents" is ticked, or picked. School Manager / System Admin: no access.
    Not allowed = not found. People picked one by one must belong to the class (students studying, their parents,
    the class's teachers) and have an active account; at most 100 (ASSUMPTION). On update, people saved earlier who
    have since left the class or been locked are dropped quietly; a newly picked person outside the class is refused.
  - "Own subject" = a teaching assignment of the teacher for that class and subject covering the event's day
    (ASSUMPTION). General events (no subject): homeroom teacher only.
  - Times are Vietnam time; an event starts later than now, ends after it starts (end optional) **on the same day**
    (ASSUMPTION: the form has one date; several days = several events), and stays inside the class's school year; an
    ended school year is read only. Title 1–255 characters, description up to 2000
    (ASSUMPTION).
  - An event that has started can no longer be updated or deleted (ASSUMPTION: it is class history). Delete = soft.
  - Two tabs / two people saving the same event: the update sends the version it was opened with (`stamp`, built
    from the event's content); if the event was saved in between the server answers 409 `MSG_EVENT_CHANGED` and the
    form offers "Tải lại". Leaving the form with unsaved changes asks first.
  - Notifications: a general bell notification to the audience when an event is created (ASSUMPTION: none on update /
    delete); the reminder is a **personal** notification (`CLASS_EVENT`, `created_by` NULL) sent by
    `sendClassEventReminders()` in `server/src/modules/calendar/calendar.reminders.js` – the FE-09 job (UC-69) calls it
    (hourly or daily; it never sends twice). An event moved to less than a day ahead is reminded at the next run
    ("Hôm nay – …" when it is today, otherwise "Ngày mai – …"). Recipients: the audience except the creator; locked accounts are skipped;
    a parent gets one row with `student_id` = the child concerned.
  - Note for the lead: the `set_updated_at` trigger also fires when the reminder job sets `reminded_at`, so
    `class_events.updated_at` is not "last edited by a person"; the detail hides an `updated_at` that only comes from
    that reminder write.

- **Period times (13/11/2026, Dung, requested for the School Manager – no UC id yet, waiting for the lead):** the School
  Manager sets the **start of each session** (morning, afternoon) and **one length for every period** on
  `/timetables/period-times` (button "Giờ học" on SCR-27); the **break after each period keeps its current length**.
  Sessions are found from the current times (a break longer than 45 minutes starts a new session; seed: periods 1–5
  morning, 6–10 afternoon). Rules (ASSUMPTION): a period lasts 30–60 minutes; lessons between 05:00 and 22:00; at
  least 60 minutes between the end of one session and the start of the next. `time_slots` keeps no history and the
  timetables store period numbers only, so **every day, past weeks included, shows the new times**. Two managers:
  a save made from a page opened before someone else's save is refused (`MSG_PERIOD_TIMES_CHANGED`). Each change is
  logged (`activity_logs` SETTING_CHANGE, target TIME_SLOTS). No notification is sent (ASSUMPTION).
- **School calendar (13/11/2026, Dung – "Lịch sắp tới của trường" of Stitch SCR-34; table `school_events`, proposed
  `patch_v0.3_school_events.sql`, waiting for the lead; no UC id yet):**
  - The School Manager adds, edits and deletes school-wide dates (title, start, optional end – may be another day,
    place, note) for the **whole school or one grade**. Start in the future (checked again only when it changes),
    inside a school year; the end inside the same year. Past dates can be corrected or deleted too (Dung's request,
    13/11; a date that already started may keep or get a past start). Delete is a soft delete. Stale save →
    `MSG_SCHOOL_EVENT_CHANGED`. The same name (ignoring case and extra spaces) on the same day for the same audience
    is refused as a duplicate (`MSG_SCHOOL_EVENT_DUPLICATE`). The page lists 10 dates per page (tabs Sắp tới / Đã qua).
  - Who sees (ASSUMPTION – public inside the school): School Manager and teachers – every date; students and parents –
    whole-school dates and the dates of the grades of their (children's) classes being studied.
  - Shown on the school feed column (next 5 dates), on `/school-events` (menu "Lịch của trường": upcoming / past) and,
    read only, in the class calendar (SCR-39) of the classes of that grade. No notification yet (ASSUMPTION; FE-09).

- **Automatic scheduling (17/11/2026, Dung – no UC id, spec "Đặc tả: Tự động phân công & xếp thời khoá biểu"):**
  School Manager, button "Xếp tự động" on SCR-27 (`/timetables/auto`). Three modes: assignment + timetable, assignment
  only, timetable only (uses the running assignments). The server makes a **draft**; nothing is saved until "Áp dụng".
  - Range: from today (or the semester's first day) to the semester's last day. New assignments run from that day to
    the end of the school year (one teacher per class and subject); history before it is kept (same code as SCR-19).
  - Week grid (default 5 mornings × 5 + Tuesday and Thursday afternoons × 2 = 29 cells; morning ≤ 5, afternoon ≤ 3,
    ≤ 6 days – Công văn 7291). Periods per week from `track_subjects`, changeable for the semester being scheduled
    (History: 1 in semester I, 2 in semester II). Fixed cells: Chào cờ (Monday period 1) and Sinh hoạt lớp (Friday
    period 5) taken from HĐTN, a different teacher in every class (the homeroom teacher first); they do not count
    towards the norm.
  - Norm 17 periods/week, homeroom teacher 13 (Thông tư 05/2025), at most 4 over (ASSUMPTION: school's choice).
  - Hard rules (never broken, re-checked on apply): qualified teacher, one teacher per (class, subject), weekly cap,
    no teacher / class clash (lessons of classes not in the run included), exact periods per subject, only grid cells,
    rooms per subject (e.g. Tin học 1 room), teacher busy cells, at most 2 periods of a subject per day.
  - Soft rules (weighted penalty, weights editable): teacher gaps, two periods of a subject not adjacent, more than 4
    periods a day, a subject packed into one day, heavy subjects (Toán, Văn, Anh) at periods 4–5 or afternoon,
    afternoon subjects in the morning, empty cells before a lesson (empty cells go to the end of a session),
    overload, imbalance, homeroom teacher not teaching their class.
  - Checked before running (blocking): grid periods missing in `time_slots`, a class needing more periods than cells,
    not enough teachers for a subject (need vs norm + overload of the qualified teachers), not enough teachers for
    the fixed cells, too few rooms, timetable-only mode without running assignments.
  - Apply: refused when assignments or timetables changed since the draft (`MSG_AUTO_STALE`), when a class already has
    a timetable / assignments and the overwrite is not confirmed (`MSG_AUTO_CONFIRM`), or when the draft breaks a hard
    rule or misses lessons. Lessons with attendance are kept; class groups follow the new assignments (FE-04 sync).
  - Algorithm (Node, no external service): step A greedy with balancing + pairwise improvement; step B constraint
    satisfaction – hardest lessons first, least-penalty cell, one-step repair, then local search (swaps) until the
    time limit (default 5 s). Same data + seed = same draft; "Xếp lại" changes the seed.
  - Sample data: `database/sample_auto_schedule.sql` (grade 10: 6 classes, 12 more teachers) and
    `database/sample_grade_11_12.sql` (grades 11 and 12: 9 more classes, 20 more teachers; grade 11 already assigned
    for "Chỉ xếp tiết", grade 12 not assigned for "Phân công + xếp tiết"). Both only add rows.

## 11. Grades (FE-11)
- SM configures the grade structure per **subject × grade level × semester**: components with a weight and a number
  of scores (`score_count`, e.g. regular tests = 4 scores, mid-term = 1, final = 1). Semester 2 is copied from
  semester 1 and edited independently; copying to another subject makes an independent copy. **The structure locks
  once the semester has grades.**
  - Limits (FE-11, 10/11/2026): at most 10 components, 1–10 scores each, weight > 0 and ≤ 100 with at most 2
    decimals.
  - The lock is per **subject × grade level × semester** (any `grades` row of that structure, even a cleared score),
    not the whole semester.
  - Saving a structure that has no grades yet replaces its components: the old `grade_components` rows are hard
    deleted (configuration, no `grades` row points to them, §14).
  - UC-82 copies the shown structure to **one or several subjects** of a semester × grade level at once (at most 50),
    each an independent copy that replaces the target's components. If any target already has grades the whole copy
    is refused and nothing changes (14/11/2026).
- Each individual score is its own `grades` row (`attempt_no`); averages are **not stored**, they are computed:
  subject semester average = weighted average of the scores present; subject year average = (S1 + 2 × S2) / 3;
  student semester / year average = average of subjects (every `track_subjects.weight` is 1, so a plain average).
  Subjects counted = those with a grade structure for the class's grade that year (only the class type's subjects
  when set); a subject without a structure is not counted.
- **Rounding (Circular 22/2021, 14/11/2026):** every average is rounded to 1 decimal, half up (7.94 → 7.9,
  7.95 → 8.0). Each step uses the **rounded** result of the step before: subject semester average → subject year
  average → student average. Ranking compares the rounded averages, so students with the same shown average share
  a rank.
- Teachers enter / import grades only for their assigned class + subject, with an assignment that is current or
  still to come (`end_date` ≥ today); a teacher whose assignment has ended can only view. Only **studying** students
  are edited, required for finalizing and ranked; transferred / dropped students keep their old grades, read only.
  A student moved by UC-10 within the year keeps the scores from the other class; when both classes have the same
  score slot, the score of the current class wins.
- **Import (UC-84):** an empty score cell keeps the current score (clearing a score is done on the entry screen,
  UC-83). Imported scores go into the grid **unsaved**; the teacher checks them and saves. The import dialog lists
  only the rows with errors.
- **Export:** a grade book (class × subject × semester) can be exported to Excel by anyone who can view it (assigned
  teacher, teachers of the class, SM), finalized or not: each score, the semester average, the book status and a note
  (left the class / missing scores). It is for reading and printing; scores are changed through the import template.
- **Finalize** (UC-85) locks the grade book (class × subject × semester, `grade_locks`). It is **blocked if any
  currently studying student is missing a score** = any score slot of any component is empty (e.g. 4 regular tests,
  1 mid-term and 1 final are all needed). To change a finalized grade the teacher asks SM outside the
  system; SM **unlocks** (UC-86, optional reason ≤ 255 characters in the log, the teacher is not notified); the
  teacher edits and finalizes again. A grade book is OPEN (never finalized), LOCKED (finalized) or UNLOCKED (unlocked
  by SM). SM views a book read only with tabs Học kỳ 1 / Học kỳ 2 / Cả năm.
- Every grade entry and change is logged in `grade_histories` (first entry has `old_score` NULL). Grade rows are never
  deleted; clearing a score = `score` NULL.
- Viewing: students / parents only their own / child's; teachers see all grades of classes they teach; SM sees the
  whole school (read only). Students / parents see only their own rank.
- **Students and parents see only finalized grade books (14/11/2026).** A book never finalized is "not published":
  its scores are left out of every average and rank. A book unlocked by SM for a correction keeps showing the scores
  **as finalized** (rebuilt from `grade_histories`) until the teacher finalizes it again. For teachers and SM an
  average or rank is provisional while a subject's book of the period is not finalized.

## 12. Attendance (FE-12)
- Per period, 4 statuses: `PRESENT`, `LATE`, `ABSENT_EXCUSED`, `ABSENT_UNEXCUSED`. No leave-request feature.
- The subject teacher takes attendance for periods they teach and can edit until **23:59 the same day**. After that:
  the homeroom teacher (own class) can only switch excused ↔ unexcused, until the semester is closed; every other
  change is SM only.
  Why (18/11/2026, lead): present / late / absent is what the subject teacher sees in the period, so it is fixed
  early; whether an absence is excused depends on the family's explanation, which reaches the homeroom teacher days
  later (there is no leave request in the system), and the excused / unexcused counts are final when the semester
  closes. The homeroom teacher never changes absent ↔ present / late.
- **Every action is logged** in `attendance_histories`, including the first take (`old_status` NULL).
- **Notifications (18/11/2026, lead):** personal (`type` / `target_type` ATTENDANCE, `is_personal` TRUE,
  `student_id` = the student) to the **student and their linked parents** (active accounts), **one per period**
  (no grouping by day). Sent when attendance is saved: first take with a status other than PRESENT, and every
  later change of status (subject teacher, homeroom teacher, SM) where the old or the new status is not PRESENT –
  the text says "from X to Y". Nothing is sent for PRESENT on the first take or when only the note changes; the
  server compares with the stored status, so saving the sheet twice sends nothing new.
- Students, parents and teachers of the class view per period; SM sees school-wide statistics; export to Excel.
  Attendance does not affect grades.
- **Details agreed before coding (18/11/2026, lead):**
  1. A period can be taken from its start time (`time_slots.start_time`) until the edit deadline of that day.
  2. The sheet of a period = students of the class on that date: `enrolled_at` on or before the date and not left
     (`left_at` NULL or after the date). Records of students who left later stay.
  3. The sheet opens with everyone PRESENT; the teacher changes the exceptions and saves the **whole class at once**
     (no partial save). Each student has an optional note (`attendances.note`).
  4. A period not taken by the deadline: the subject teacher and the homeroom teacher can no longer enter it; only SM
     enters it, with a reason.
  5. Reason (`attendance_histories.reason`): optional for the subject teacher on the day; **required** for the
     homeroom teacher's excused ↔ unexcused switch and for every SM change.
  6. SM can correct at any time (also a closed semester or an ended school year); every change is in the history.
  7. A subject teacher sees only the periods of the subjects they teach in the class; the homeroom teacher sees every
     period of their class.
  8. Student / parent (UC-92): per-semester totals (late, excused, unexcused) and the list of periods that were not
     PRESENT, filtered by month; mobile layout; a parent picks a child as in the timetable (SCR-53).
  9. SM statistics (UC-94, Excel export): semester or date range, grade filter; per class: periods taken / periods
     held, present rate, late, excused, unexcused; a class opens its students; a list of **periods not taken yet**.
     No "too many absences" warning (no agreed threshold).
  10. Teacher entry: "Điểm danh" in the lesson detail of the teaching schedule (SCR-57) and the "Điểm danh lớp" page
      (SCR-56: class, date, period); SM corrects on SCR-52. Menu "Điểm danh" for Teacher, Student, Parent and SM.
- **Assumptions made while building FE-12 (18/11/2026, Quoc – to confirm):**
  - The homeroom teacher may switch excused ↔ unexcused as soon as a period is taken (also on the same day), not only
    after the subject teacher's deadline.
  - SM cannot enter a period that has not started yet (same as everyone).
  - "Present rate" = (present + late) / records; late is also counted apart.
  - The reason of a homeroom / SM change is quoted in the notification to the student and parents; the teacher's note
    is quoted in the first notification.
  - Saving only a note (same status) writes no history row and sends nothing.
  - A student whose enrollment was reopened (transfer back, §4) appears on the sheets of the days they were away.
- **Decided after the first review (18/11/2026, lead):**
  - The homeroom teacher's excused ↔ unexcused switch also ends when the **school year has ended**, even if a semester
    was left open (`MSG_SCHOOL_YEAR_ENDED`); SM can still correct.
  - The homeroom right belongs to the **current** homeroom teacher of the class: a new homeroom teacher may switch
    periods from before they took the class, the previous one no longer can.
  - No check for a sheet changed by someone else while it was open (a sheet is taken at once, not left open); the last
    save wins and every change is in the history.
  - A period outside every semester is not expected (periods are always inside a semester); no special message.
  - If System Admin sets the deadline earlier than a period's start (e.g. 17:00 for period 10 at 17:00), the subject
    teacher can never take that period; only SM can. Accepted.
  - Leaving the class attendance page with unsaved changes (menu, link, Back, closing the tab, another period / day /
    class) asks first.

## 13. System administration (FE-13)
- `system_settings` (key–value, loaded by SQL; SA edits values only): sign-in lock thresholds, upload limits, OTP
  lifetime, password reset request cooldown, attendance edit deadline, chat delete-for-everyone time. Allowed values
  (01/11/2026): wrong passwords before a lock 3–10; lock step 1–60 min; lock max 1–1440 min; images / files 1–50 MB;
  videos 1–50 MB (lowered from 200 by the lead 11/11/2026: the Supabase Free plan takes files up to 50 MB); OTP lifetime 1–30 min; reset request cooldown 1–1440 min (default 15); attendance deadline a time
  `HH:MM`; `chat.delete_for_everyone_minutes` 1–1440 min (default 15, §6; agreed by the lead 07/11/2026).
  23/11/2026 (Linh): the attendance edit deadline (`attendance.edit_deadline_time`) is no longer on the System Admin
  settings page; the row stays in `system_settings` and FE-12 keeps reading it. Dung moves its editing to the School
  Manager's settings page.
- `activity_logs` (never deleted) records only important actions: sign-in success / failure, account create /
  import / lock / unlock, password reset, role change, setting change, grade unlock. **The log is only kept in the
  database – there is no screen to view it** (UC "View Activity Log" and its screen removed 01/11/2026 on the
  supervisor's advice).

## 14. Deleting data
- **Every delete in the system is a soft delete** (`deleted_at`, often `deleted_by`): never `DELETE` business rows,
  always filter `deleted_at IS NULL`.
- Hard delete is allowed only for technical / configuration rows: `department_subjects` (07/11/2026), `timetable_slots`
  without attendance when a timetable range is generated again (§10, 10/11/2026), `post_likes` (unlike), `message_reactions`
  (reaction removed, §6), `class_event_viewers`,
  `teacher_subjects`, `user_roles`, `student_parents` (unlink), expired OTPs, `track_subjects` (a subject removed
  from a class type while the year has no grades, §4), `grade_components` (replaced while the structure has no
  grades, §11, 17/11/2026).
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
