# Use cases (107) – numbering after the 20/10/2026 database review

Source: Report 3 section 4.2 (draft v1.3). Actor "User" = any signed-in account. "Homeroom Teacher" is not a role: it is a Teacher who is `classes.homeroom_teacher_id` of that class.

## FE-01 Personal Account

| ID | Use case | Actor | Sub-feature | Description |
|---|---|---|---|---|
| UC-01 | Sign In | User | Authentication | Sign in with email, phone number or username and a password; temporary sign-in lock after 5 failed attempts; forced password change at first sign-in. |
| UC-02 | Reset Forgotten Password | User, Email Service | Password Management | Receive an OTP by email, verify it and set a new password. Without a usable email: send a reset request to System Admin / School Manager. |
| UC-03 | Sign Out | User | Authentication | End the current session. |
| UC-04 | View Profile | User | Personal Profile | View personal, school, class and role information. |
| UC-05 | Change Password | User | Password Management | Change the current password following the password rules. |
| UC-06 | Change Avatar | User | Personal Profile | Upload or replace the profile picture. |

## FE-02 Student Management

| ID | Use case | Actor | Sub-feature | Description |
|---|---|---|---|---|
| UC-07 | View Student List | School Manager | Student Records | Search and filter students by class and status. |
| UC-08 | View Student Detail | School Manager | Student Records | View a student's profile, class history and linked parents. |
| UC-09 | Update Student | School Manager | Student Records | Update a student's profile (not login identifiers). |
| UC-10 | Transfer Student | School Manager | Enrollment Changes | Move a student to another class in the same school year. |
| UC-11 | Promote Students | School Manager | Enrollment Changes | Enroll students into the new school year; old class groups become read-only. |
| UC-12 | View Student's Parents | School Manager | Parent Linking | View the parents linked to a student. |
| UC-13 | Link / Unlink Parent–Student | School Manager | Parent Linking | Link or unlink a parent and a student (at most 2 parents per student), from the student or the parent side. |
| UC-14 | Import Parent–Student Links | School Manager | Parent Linking | Link parents and students in bulk from a file, with a preview before saving. |

## FE-03 Teacher Management

| ID | Use case | Actor | Sub-feature | Description |
|---|---|---|---|---|
| UC-15 | View Teacher List | School Manager | Teacher Records | Search and filter teachers. |
| UC-16 | View Teacher Detail | School Manager | Teacher Records | View a teacher's profile and teaching assignments. |
| UC-17 | Update Teacher | School Manager | Teacher Records | Update a teacher's profile (not login identifiers). |
| UC-18 | Assign Teaching Classes & Subjects | School Manager | Teaching Assignment | Assign a teacher to (class, subject) pairs; one teacher per pair; reassign when a teacher is locked. |
| UC-19 | Assign Homeroom Teacher | School Manager | Teaching Assignment | Designate one homeroom teacher per class per school year. |

## FE-04 Class & Group Management

| ID | Use case | Actor | Sub-feature | Description |
|---|---|---|---|---|
| UC-20 | Manage School Years | School Manager | Academic Year & Subject Setup | Create and update school years. |
| UC-21 | Manage Semesters | School Manager | Academic Year & Subject Setup | Create the two semesters of a school year and close a semester (closing ends attendance corrections). |
| UC-22 | View Subject List | School Manager | Academic Year & Subject Setup | List the school's subjects. |
| UC-23 | View Subject Detail | School Manager | Academic Year & Subject Setup | View a subject and where it is taught. |
| UC-24 | Create Subject | School Manager | Academic Year & Subject Setup | Add a subject. |
| UC-25 | Update Subject | School Manager | Academic Year & Subject Setup | Update a subject. |
| UC-26 | Manage Class Types | School Manager | Academic Year & Subject Setup | Define class types and, for each school year, each subject's weight and periods per week; weights lock once grades exist. |
| UC-27 | Import Class List | School Manager | Class Groups | Import classes and their students (accounts must exist); automatically creates the general, student and parent groups of each class. |
| UC-28 | Create Class Group | School Manager | Class Groups | Create a class group manually. |
| UC-29 | View Group List | Teacher, Student, Parent, School Manager | Class Groups | View the groups the user belongs to (School Manager: all class groups, without their feeds or chats). |
| UC-30 | View Group Detail | Teacher, Student, Parent, School Manager | Class Groups | View a group's information. |
| UC-31 | View Group Members | Teacher, Student, Parent, School Manager | Class Groups | View the members of a group. |
| UC-32 | Add Group Member | School Manager, Homeroom Teacher | Class Groups | Add members of the same class to a group. |
| UC-33 | Remove Group Member | School Manager, Homeroom Teacher | Class Groups | Remove a member from a group. |
| UC-34 | Set Student Nickname | Homeroom Teacher | Class Groups | Set a nickname shown only inside that class. |
| UC-35 | Create Team Chat | Teacher, Student, Parent | Teams | Create a chat-only team with members of one class. |

## FE-05 Group Feed

| ID | Use case | Actor | Sub-feature | Description |
|---|---|---|---|---|
| UC-36 | View Group Feed | Teacher, Student, Parent, School Manager (teacher group) | Posting & Interaction | View the feed of a class general group or the teacher group. |
| UC-37 | View Post Detail | Teacher, Student, Parent, School Manager (teacher group) | Posting & Interaction | View a post with its comments and reactions. |
| UC-38 | Create Post | Teacher, Student, Parent, School Manager (teacher group) | Posting & Interaction | Create a post; it waits for approval when approval applies. |
| UC-39 | Edit Own Post | Teacher, Student, Parent, School Manager (teacher group) | Posting & Interaction | Edit one's own post. |
| UC-40 | Delete Own Post | Teacher, Student, Parent, School Manager (teacher group) | Posting & Interaction | Delete one's own post. |
| UC-41 | Comment on Post | Teacher, Student, Parent, School Manager (teacher group) | Posting & Interaction | Comment on a post. |
| UC-42 | Delete Comment | Teacher, Student, Parent, School Manager | Posting & Interaction | Delete one's own comment, or any comment on one's own post (group posts and school announcements). |
| UC-43 | React to Post | Teacher, Student, Parent, School Manager (teacher group) | Posting & Interaction | React to a post. |
| UC-44 | Pin / Unpin Post | Homeroom Teacher (class), School Manager (teacher group) | Moderation | Pin or unpin a post. |
| UC-45 | Hide Post / Delete Comment | Homeroom Teacher (class), School Manager (teacher group) | Moderation | Hide an inappropriate post, or delete any comment in the group. |
| UC-46 | Approve / Reject Post | Homeroom Teacher (class), School Manager (teacher group) | Moderation | Approve or reject pending posts. |

## FE-06 Messaging

| ID | Use case | Actor | Sub-feature | Description |
|---|---|---|---|---|
| UC-47 | Chat in Group | Teacher, Student, Parent, School Manager (teacher group) | Group & Team Chat | Send and receive real-time messages in a group or team. |
| UC-48 | View Conversation List | Teacher, Student, Parent, School Manager | Private Messaging | View group, team and private conversations. |
| UC-49 | Send Private Message | Teacher, Student, Parent, School Manager (teacher group) | Private Messaging | Search a member within one's classes (School Manager: within the teacher group) and chat one-to-one. |

## FE-07 Extracurricular Event Management

| ID | Use case | Actor | Sub-feature | Description |
|---|---|---|---|---|
| UC-50 | Create Event | Homeroom Teacher | Event Posts | Post an extracurricular event in the class feed with a registration deadline. |
| UC-51 | Update Event | Homeroom Teacher | Event Posts | Update an event. |
| UC-52 | Cancel Event | Homeroom Teacher | Event Posts | Cancel an event and notify registered parents. |
| UC-53 | View Event Detail | Homeroom Teacher, Student, Parent | Event Posts | View an event and its registration status. |
| UC-54 | Register Child for Event | Parent | Registration | Register a selected child before the deadline. |
| UC-55 | Cancel Child Registration | Parent | Registration | Cancel a child's registration before the deadline. |
| UC-56 | View Registration List | Homeroom Teacher | Registration List | View registered students. |
| UC-57 | Export Registration List | Homeroom Teacher | Registration List | Export the registration list to Excel. |

## FE-08 School Feed

| ID | Use case | Actor | Sub-feature | Description |
|---|---|---|---|---|
| UC-58 | View School Feed & News | Teacher, Student, Parent, School Manager | Feed & News View | View school posts and news addressed to the user. |
| UC-59 | View School Post Detail | Teacher, Student, Parent, School Manager | Feed & News View | View a school post. |
| UC-60 | Create School Post | School Manager | School Announcements | Create an announcement or news post and choose its audience. |
| UC-61 | Update School Post | School Manager | School Announcements | Update a school post. |
| UC-62 | Delete School Post | School Manager | School Announcements | Delete a school post. |
| UC-63 | Pin / Unpin School Post | School Manager | School Announcements | Pin or unpin a school post. |
| UC-64 | React to School Post | Teacher, Student, Parent, School Manager | Feed Interaction | React to a school announcement (news posts are view only). |
| UC-65 | Comment on School Post | Teacher, Student, Parent, School Manager | Feed Interaction | Comment on a school announcement (news posts are view only). |
| UC-66 | Delete School Post Comment | School Manager | School Announcements | Delete an inappropriate comment on a school announcement. |

## FE-09 Notifications

| ID | Use case | Actor | Sub-feature | Description |
|---|---|---|---|---|
| UC-67 | View Notifications | User | In-app Notifications | View notifications, mark them as read and open the source item. |
| UC-68 | View Notification Read Status | Teacher, School Manager | In-app Notifications | See who has not yet read a personal notification about an item one created, in order to remind them. |
| UC-69 | Send Event Reminders | Scheduler | Scheduled Reminders | Send a reminder 1 day before a class event to everyone who can see it. |

## FE-10 Schedule Management

| ID | Use case | Actor | Sub-feature | Description |
|---|---|---|---|---|
| UC-70 | View Timetable Management | School Manager | Class Timetable | View all class timetables. |
| UC-71 | Create Class Timetable | School Manager | Class Timetable | Enter a class timetable. |
| UC-72 | Import Class Timetable | School Manager | Class Timetable | Import timetables from a file, checking clashes and teaching assignments. |
| UC-73 | Update Class Timetable | School Manager | Class Timetable | Update a timetable; changes appear at once in class and teacher views. |
| UC-74 | View Class Timetable | Teacher, Student, Parent | Class Timetable | View a class timetable (parent selects a child first). |
| UC-75 | View Teaching Schedule | Teacher | Teaching Schedule | View the schedule built automatically from teaching assignments. |
| UC-76 | View Class Calendar | Teacher, Student, Parent | Class Calendar Events | View class events by day; events appear automatically for their audience. |
| UC-77 | View Calendar Event Detail | Teacher, Student, Parent | Class Calendar Events | View a class event. |
| UC-78 | Create Calendar Event | Teacher | Class Calendar Events | Create a class event for one's own subject (homeroom teacher: also general class events) and choose its audience. |
| UC-79 | Update Calendar Event | Teacher (event creator) | Class Calendar Events | Update one's own event. |
| UC-80 | Delete Calendar Event | Teacher (event creator) | Class Calendar Events | Delete one's own event. |

## FE-11 Grade Management

| ID | Use case | Actor | Sub-feature | Description |
|---|---|---|---|---|
| UC-81 | Configure Grade Structure | School Manager | Grade Structure | Set weighted grade components per subject, grade level and semester, including how many scores each component has; locked once the semester has grades. |
| UC-82 | Copy Grade Structure | School Manager | Grade Structure | Copy semester 1 to semester 2, or one subject to another, as an independent copy. |
| UC-83 | Enter Grades | Teacher | Grade Entry | Enter grades for an assigned class and subject. |
| UC-84 | Import Grades | Teacher | Grade Entry | Import grades from a file for an assigned class and subject. |
| UC-85 | Finalize Grades | Teacher | Grade Entry | Finalize the grades of a class, subject and semester, which locks them. |
| UC-86 | Unlock Grades | School Manager | Grade Control | Unlock finalized grades of a class, subject and semester. |
| UC-87 | View Grade Change History | School Manager | Grade Control | View who changed which grade and when. |
| UC-88 | View Grades | Teacher, Student, Parent, School Manager | Results & Ranking | View grades and semester / year averages within the role's scope. |
| UC-89 | View Class Ranking | Teacher, Student, Parent, School Manager | Results & Ranking | View the class ranking (student / parent: own rank only). |

## FE-12 Attendance Management

| ID | Use case | Actor | Sub-feature | Description |
|---|---|---|---|---|
| UC-90 | Take Attendance | Teacher | Attendance Taking | Record one of 4 statuses per student for a period one teaches; editable until 23:59 the same day; parents are notified when not present. |
| UC-91 | Edit Attendance | Homeroom Teacher, School Manager | Attendance Correction | After the day: homeroom teacher switches excused / unexcused until the semester is closed; School Manager makes other corrections; changes are logged. |
| UC-92 | View Student Attendance | Student, Parent | Attendance View & Statistics | View one's own or a child's attendance per period. |
| UC-93 | View Class Attendance | Teacher | Attendance View & Statistics | View and export the attendance of a class one teaches. |
| UC-94 | View School Attendance Statistics | School Manager | Attendance View & Statistics | View and export school-wide attendance statistics. |

## FE-13 System Administration

| ID | Use case | Actor | Sub-feature | Description |
|---|---|---|---|---|
| UC-95 | Create Account | System Admin | Account Provisioning | Create an account for any role; username generated automatically; random temporary password shown once. |
| UC-96 | Import Accounts | System Admin | Account Provisioning | Import accounts from a file with checks and a preview. |
| UC-97 | View Account List | System Admin | Account Provisioning | List all accounts, filtered by role and status. |
| UC-98 | Export Account List | System Admin | Account Provisioning | Export accounts with usernames and initial passwords for handover outside the system. |
| UC-99 | Update Login Identifiers | System Admin | Account Control | Change an account's email, phone number or username. |
| UC-100 | Reset Password | System Admin, School Manager | Account Control | Reset a password to a random temporary one (School Manager: student, parent and teacher accounts only). Can be started from a password reset request (then marks it done) or reject the request. |
| UC-101 | Lock / Unlock Account | System Admin, School Manager | Account Control | Lock or unlock an account, or clear a temporary sign-in lock (same scope as UC-100). |
| UC-102 | Configure System Settings | System Admin | System Configuration & Maintenance | Change system settings. |
| UC-103 | Post Maintenance Announcement | System Admin | System Configuration & Maintenance | Schedule maintenance: notify all accounts and show a banner beforehand; during maintenance users cannot sign in and see a maintenance message. |
| UC-104 | View Activity Log | System Admin | Activity Log | View the system activity log. |

## FE-14 Parent Management

| ID | Use case | Actor | Sub-feature | Description |
|---|---|---|---|---|
| UC-105 | View Parent List | School Manager | Parent Records | Search and filter parents. |
| UC-106 | View Parent Detail | School Manager | Parent Records | View a parent and their linked children; link / unlink uses UC-13. |
| UC-107 | Update Parent Information | School Manager | Parent Records | Update a parent's profile (not login identifiers). |
