# Screen list (SCR-1..SCR-93, SCR-48 removed)

Source: Report 3 section 5.1 (draft v1.3). Screen numbers here are Report 3's; the numbering in `Screen_List_Report3_v1.2` (ordered by FE) differs. Besides desktop, 8 screens also need a mobile layout (decided 18/10): Login Page, Group Feed, Group Post Detail, Chat Room, School Feed, Timetable View, Academic Results, Child Attendance. No dashboard screen.

SCR-74..SCR-83 (added 18/11/2026 by the lead): pages already running in the code that had no screen number. Existing
numbers are never changed (code comments refer to them). Screens marked "(planned)" belong to FE-09 / FE-12, still being
built in Iteration 3. SCR-84 (added 20/11/2026): the group comment report queue merged on 19/11/2026 (FE-05).
SCR-85 (added 23/11/2026, FE-13, already in Report 3): contact details of an account changed by the School Manager.
SCR-86 (added 24/11/2026 by the lead): the School Manager settings page merged on 24/11/2026 (FE-10, UC-133).
SCR-87..SCR-93 (added 25/11/2026, FE-08 Anh): community standards – the School Manager's page “Quy chuẩn cộng đồng” and its
tabs, one person's violation history, the review of a reported message and the report dialog in the chat (UC-135..UC-139,
business rules §17). Tables and filters only, no dashboard.

| # | Screen | Feature | Description |
|---|---|---|---|
| 1 | Login Page | FE-01 | Allows User to authenticate using the school-issued account |
| 2 | School Feed | FE-08 | Displays school-wide posts and provides access to school feed management. |
| 3 | User Profile | FE-01 | Displays the User's profile information; a Parent also opens each linked child's profile from it (UC-109). |
| 4 | Notifications | FE-09 | Displays notifications and reminders relevant to User. (planned) |
| 5 | School Post Detail | FE-08 | Displays details of a school announcement or news post. |
| 6 | Update School Post | FE-08 | Allows School Manager to update an existing school announcement or news post. |
| 7 | Student List | FE-02 | Displays students managed by the school. |
| 8 | Student Detail | FE-02 | Displays detailed information about a student. |
| 9 | Update Student | FE-02 | Allows School Manager to update student information. |
| 10 | Parent Detail | FE-14 | Displays a parent and their linked children. Allows School Manager to link or unlink a child, reset the parent’s password and lock or unlock the account. |
| 11 | Student Transfer & Promotion | FE-02 | Supports student transfers and grade promotion. |
| 12 | Student Parent Detail | FE-02 | Displays relationship information between a student and associated parents. |
| 13 | Update Student Relationship | FE-02 | Allows School Manager to update the relationship between a student and associated parents. |
| 14 | Teacher List | FE-03 | Displays teachers managed by the school. |
| 15 | Teacher Detail | FE-03 | Displays detailed information about a teacher. |
| 16 | Update Parent | FE-14 | Allows School Manager to update a parent’s profile |
| 17 | Update Teacher | FE-03 | Allows School Manager to update teacher information. |
| 18 | Homeroom Assignment | FE-03 | Allows School Manager to assign a teacher as the homeroom teacher of a class. |
| 19 | Teaching Assignment | FE-03 | Allows School Manager to manage teaching assignments for teachers. |
| 20 | Group List | FE-04 | Displays class groups available to the User according to their permissions. |
| 21 | Group Detail | FE-04 | Displays detailed information about a selected class group. |
| 22 | Group Member List | FE-04 | Displays members of a selected class group. |
| 23 | Subject List | FE-04 | Displays the list of subjects used for academic and grading management. Since 27/11/2026 the class types of a subject show as one line ("12 loại lớp (Khối 10–12)"); "Xem chi tiết" opens a pop-up with each type and its periods per week, grouped by grade. |
| 24 | Subject Detail | FE-04 | Displays detailed information about a selected subject. |
| 25 | Grade Configuration | FE-11 | Allows School Manager to configure the grading structure for a subject or class. |
| 26 | Create / Update Subject | FE-04 | Allows School Manager to create a subject or update information of an existing subject. Since 17/11/2026 a pop-up opened from the subject list ("Thêm môn học") or the subject detail ("Sửa thông tin môn"); the old create / edit addresses open the same pop-up (UC-24, UC-25). |
| 27 | Timetable Management | FE-10 | Allows School Manager to manage school timetable information. |
| 28 | Create Time Table | FE-10 | Allows School Manager to create new timetable information. |
| 29 | Time Table View | FE-10 | Displays timetable information managed by School Manager . |
| 30 | Update Time Table | FE-10 | Allows School Manager to update existing timetable information. |
| 31 | Create School Post | FE-08 | Allows School Manager to create a new school announcement or news post. |
| 32 | Forgot Password | FE-01 | Allows User to start the password recovery process by email OTP, or to send a password reset request (sign-in name + full name, checked against the account); the system then resets the password and emails it, or shows it to System Admin / School Manager when the account has no email. |
| 33 | Edit Profile | FE-01 | Allows User to update permitted personal profile information (avatar, address and, for a parent, occupation). |
| 34 | Change Password | FE-01 | Allows authenticated User to change the current password. |
| 35 | Group Feed | FE-05 | Displays posts and community content within a selected class group. "Bài của tôi" also lists the author's posts stopped by the community standards check ("Chưa đăng – vi phạm quy chuẩn cộng đồng", words to change, Sửa / Xoá; 27/11/2026). |
| 36 | Create Group Post | FE-05 | Allows an authorized User to create a new post in a class group. A post stopped by the community standards check (27/11/2026) keeps the form open, now editing that post, with the category and the words to change. |
| 37 | Group Post Detail | FE-05 | Displays detailed content and interactions of a selected group post. |
| 38 | Update Group Post | FE-05 | Allows an authorized User to update an existing group post. Same notice for a post stopped by the community standards check; saving it clean posts it as a new post (27/11/2026). |
| 39 | Class Calendar | FE-10 | Displays scheduled events and activities of a class. |
| 40 | Create Calendar Event | FE-10 | Allows an authorized Teacher to create a new class calendar event. |
| 41 | Calendar Event Detail | FE-10 | Displays detailed information about a selected calendar event. |
| 42 | Update Calendar Event | FE-10 | Allows an authorized Teacher to update an existing calendar event. |
| 43 | Group Chat | FE-06 | Allows members to communicate within a class group chat. |
| 44 | Grade Entry | FE-11 | Allows Teacher to enter or update student grades, import them from Excel, finalize the grade book and export it to Excel. |
| 45 | Timetable View | FE-10 | Displays the class timetable or teaching schedule relevant to the User. |
| 46 | Time Table Detail | FE-10 | Displays detailed information about a selected timetable entry. |
| 47 | Academic Results | FE-11 | Displays academic results according to the User's permissions. |
| 48 | Class Ranking | FE-11 | Removed 23/11/2026 (Circular 22 does not compare students): the academic level of each student is shown on SCR-47. |
| 49 | Conversation List | FE-06 | Displays conversations available to the current User; "⋯" on a 1-1 chat or a team hides it (UC-132, 20/11/2026). |
| 50 | Chat Room | FE-06 | Displays a selected conversation and allows Users to exchange messages. |
| 51 | Attendance Statistics | FE-12 | Displays attendance statistics according to the current user's role and scope. (planned) |
| 52 | Attendance Correction | FE-12 | Allows School Manager to review and correct attendance records when necessary. (planned) |
| 53 | Select Child | FE-12 | Allows a Parent linked to multiple students to select the child whose information will be viewed or managed. (planned) |
| 54 | Child Attendance | FE-12 | Displays attendance information of the child selected by the Parent. (planned) |
| 55 | Personal Attendance | FE-12 | Displays the Student's personal attendance record. (planned) |
| 56 | Class Attendance | FE-12 | Allows Teacher to view and manage attendance records for an authorized class. (planned) |
| 57 | Teaching Schedule | FE-10 | Displays the teaching schedule assigned to the Teacher. |
| 58 | Teaching Schedule Detail | FE-10 | Displays detailed information about a selected teaching schedule entry. |
| 59 | Account List | FE-13 | Displays user accounts managed at the system administration level. Since 23/11/2026 one page per account type under the menu group "Quản lý tài khoản" (Học sinh, Giáo viên, Phụ huynh, Quản lý nhà trường, Quản trị hệ thống): the list with the role fixed, plus "Thêm" (SCR-61) and "Nhập từ file" (SCR-76) except for System Admin accounts. The list of every account ("Tài khoản người dùng") was removed. |
| 60 | Account Detail | FE-13 | Displays detailed information and administrative status of a selected user account. Since 24/11/2026 also "Thêm vai trò" next to the role chips (add a combinable role, business rules §1); School Manager has the same button in the account card of the teacher / parent detail pages. |
| 61 | Create Account | FE-13 | Allows System Admin to create a new user account and assign the appropriate role. Since 24/11/2026 the account gets only the role of the page (no role picker); a combinable role is added on SCR-60. |
| 62 | Update Account | FE-13 | Allows System Admin to update the username and the fields of the import file of an existing user account (UC-99, 22/11/2026). |
| 63 | System Settings | FE-13 | Allows System Admin to view and manage system-level configuration settings. |
| 64 | Maintenance Announcement | FE-13 | Allows System Admin to manage maintenance announcements shown to system users. |
| 65 | School Year & Semester | FE-04 | Allows School Manager to create and update school years, create the two semesters of a school year, and close a semester. |
| 66 | Create / Update Event | FE-07 | Allows Homeroom Teacher to post an extracurricular event in the class feed with a registration deadline, or to update an existing event. |
| 67 | Registration List | FE-07 | Allows Homeroom Teacher to view the students registered for an event and to export the list to Excel. |
| 68 | Grade Control | FE-11 | Allows School Manager to unlock finalized grades of a class, subject and semester, view a grade book read only (tabs Học kỳ 1 / Học kỳ 2 / Cả năm), export it to Excel and view who changed which grade and when. |
| 69 | Parent List | FE-14 | Allows School Manager to search and filter parents (search box: name, phone, username, email, or a linked child's name / student code – UC-104). |
| 70 | Class Types & Subject Weights | FE-04 | Allows School Manager to define class types (each for one grade) and set their subjects and periods per week for a school year (shown as "Loại lớp & số tiết"; every weight is 1). Periods per week from 1 to the School Manager setting (SCR-86), all subjects together at most the class week limit: a wrong value shows its reason under the box, the footer shows the total against the limit, and saving with wrong values names the subjects to fix. |
| 71 | Password Reset Requests | FE-13 | Lists the automatic resets from password reset requests (tab waiting for sign-in / used): "sent by email" or "to hand over" with the temporary password; System Admin sees all, School Manager student, parent and teacher accounts (added 01/11/2026). |
| 72 | Departments | FE-03 | Allows School Manager to create, rename and delete departments (tổ chuyên môn) and choose the subjects of each (UC-114, added 07/11/2026). |
| 73 | Import Teachers | FE-03 | Allows School Manager to create teacher accounts from a file: template, preview, import, one-time password file (UC-116, same steps as Import Accounts; added 07/11/2026). |
| 74 | Extracurricular Activities | FE-07 | Lists the extracurricular activities of the user's classes (homeroom classes for a teacher, own class for a student, children's classes for a parent), upcoming first; the homeroom teacher starts a new activity from it (UC-53, UC-50). |
| 75 | Activity Detail | FE-07 | Displays an activity with its registration status; a parent registers or cancels a child; the homeroom teacher updates or cancels the activity and opens the registration list (UC-51..UC-55). |
| 76 | Import Accounts | FE-13 | Allows System Admin to create accounts from a file: account type, template, preview, import of the valid rows, one-time file of usernames and temporary passwords (UC-96). |
| 77 | Import Parent–Student Links | FE-02 | Allows School Manager to link parents and students from a file: template, preview, import of the valid rows (UC-14). |
| 78 | Import Class Timetable | FE-10 | Allows School Manager to import the weekly timetables of one or more classes from Excel for a date range: upload, check, result; all classes are saved or none (UC-72). |
| 79 | Timetable History | FE-10 | Shows every saved timetable of a class: who saved it and when, dates still in force, what replaced which dates, periods held, the weekly pattern; CSV export (UC-124). |
| 80 | Automatic Scheduling | FE-10 | Allows School Manager to generate a draft of teaching assignments and / or timetables for a semester, review its warnings and apply it (UC-123). |
| 81 | Period Times | FE-10 | Allows School Manager to set the start of each session and the length of a period (UC-122). |
| 82 | School Calendar | FE-10 | Lists upcoming and past school-wide dates; School Manager adds, edits and deletes them (UC-126, UC-127). |
| 83 | Comment Reports | FE-08 | Allows School Manager to review reported comments of school announcements and delete the comment or dismiss the reports (UC-120). |
| 84 | Group Comment Reports | FE-05 | Allows the homeroom teacher (class groups) and the School Manager (teacher group) to review reported group feed comments and delete the comment or dismiss the reports; tabs waiting, deleted, dismissed (UC-131). |
| 85 | Update Contact Information | FE-13 | Allows School Manager to change the email and phone number of a student, teacher or parent account, opened from “Tài khoản đăng nhập” on the detail page (UC-99). |
| 86 | School Settings | FE-10 | Allows School Manager to set the school-wide values used by other features: the period limits of teachers, classes and one subject (teaching assignment, automatic scheduling, class timetables, class types), the class size – recommended size and hard cap (27/11/2026) and the time until which a subject teacher can edit the attendance of the day (UC-133). Page title “Cài đặt hệ thống”, route /school-settings. |
| 87 | Community Standards – Violators | FE-08 | Page “Quy chuẩn cộng đồng” (route /moderation, School Manager only), tab “Người vi phạm”: filters (period, grade, class, role, category, comment / message, automatic / from reports, name) and a table of people with violations – totals by category, source and way found, last time, trend against the previous period; “Xuất Excel”. No content (UC-137). |
| 88 | Violation History | FE-08 | One person's violations from SCR-87: time, category, comment or message, where it happened, way found, status (hidden / unhidden, who and why); “Xem” opens exactly one piece of content (logged), “Gỡ ẩn” with a required reason for violations found automatically (UC-137, UC-138). |
| 89 | Community Standards – By Class | FE-08 | Tab “Theo lớp” of the page: per class (at the time of each violation), the number of violations, of students with one, and the category seen most (UC-137). |
| 90 | Community Standards – Rules | FE-08 | Tab “Quy tắc”: the words and phrases of the automatic check with match type, accent-free matching, category, matches and unhides in the period, status; add, edit, turn off, delete; “Thử một câu” shows which rules a sentence matches (UC-139). |
| 91 | Community Standards – Message Reports | FE-08 | Tab “Báo cáo tin nhắn”: the queue of reported chat messages, waiting / handled, “Cần được hỗ trợ” first and highlighted; a handled report shows its “Hành vi xử lý”: the decision, who and when, the “Kết quả hỗ trợ” if any, and every “Xem hội thoại xung quanh” (who, when, reason) or “Không xem hội thoại xung quanh”; the menu entry shows how many wait, highlighted when one is “Cần được hỗ trợ” (UC-136). |
| 92 | Review Message Report | FE-08 | Opened from SCR-91: only the reported message (content, sender, time, file names); “Xem hội thoại xung quanh” after giving a reason shows a read-only window of 6 messages before and after it, the reported one highlighted, and is logged with the reason. No view of the whole chat (27/11/2026). Decision “Ẩn tin nhắn” / “Giữ nguyên”, or only “Ghi nhận”, with a required “Kết quả hỗ trợ” for “Cần được hỗ trợ” (UC-136). |
| 93 | Report Message | FE-08 | Dialog opened from a message of someone else in the Chat Room (SCR-50): a reason, an optional note (required for “Lý do khác”); choosing “Cần được hỗ trợ” shows where to get help at once (UC-135). Needs a mobile layout (Chat Room). |
