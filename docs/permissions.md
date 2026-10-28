# Permission matrix

Source: Report 3 section 4.4 (draft v1.3). Full = all records; Restricted (n) = see note n; No = no access. Checked against the **active role** (role switcher).

| Entity | Action | System Admin | School Manager | Homeroom Teacher | Teacher | Student | Parent |
|---|---|---|---|---|---|---|---|
| User account | Create / import / export | Full | No | No | No | No | No |
| User account | Change login identifiers | Full | No | No | No | No | No |
| User account | Reset password, lock / unlock | Full | Restricted (1) | No | No | No | No |
| Own account | Sign in, change password, change avatar, update address | Full | Full | Full | Full | Full | Full |
| System settings, maintenance banner, activity log | View / change | Full | No | No | No | No | No |
| Student / Parent / Teacher profile | View / update | No | Full | Restricted (2) | Restricted (2) | No | No |
| Parent–student link | Link / unlink / import | No | Full | No | No | No | No |
| Enrollment | Transfer / promote | No | Full | No | No | No | No |
| Teaching / homeroom assignment | Assign | No | Full | No | No | No | No |
| School year, semester, subject, class type | Create / update / close | No | Full | No | No | No | No |
| Class group | Create / import | No | Full | No | No | No | No |
| Class group | View list, detail, members | No | Full (3) | Restricted (4) | Restricted (4) | Restricted (4) | Restricted (4) |
| Class group | Add / remove member | No | Full | Restricted (5) | No | No | No |
| Student nickname | Set | No | No | Restricted (5) | No | No | No |
| Team | Create | No | No | Restricted (4) | Restricted (4) | Restricted (4) | Restricted (4) |
| Group feed post | View / create / comment / react | No | Restricted (6) | Restricted (4) | Restricted (4) | Restricted (4) | Restricted (4) |
| Group feed post | Edit / delete own | No | Restricted (6) | Restricted (4) | Restricted (4) | Restricted (4) | Restricted (4) |
| Group feed post | Pin / hide / approve | No | Restricted (6) | Restricted (5) | No | No | No |
| Group feed comment | Delete | No | Restricted (6) | Restricted (16) | Restricted (16) | Restricted (16) | Restricted (16) |
| Group / team chat | Send / read | No | Restricted (6) | Restricted (4) | Restricted (4) | Restricted (4) | Restricted (4) |
| Private message | Send / read | No | Restricted (6) | Restricted (4) | Restricted (4) | Restricted (4) | Restricted (4) |
| Extracurricular event | Create / update / cancel / export list | No | No | Restricted (5) | No | No | No |
| Extracurricular event | View | No | No | Restricted (5) | No | Restricted (4) | Restricted (4) |
| Extracurricular event | Register / cancel child | No | No | No | No | No | Restricted (7) |
| School post | Create / update / delete / pin | No | Full | No | No | No | No |
| School post | View | No | Full | Restricted (8) | Restricted (8) | Restricted (8) | Restricted (8) |
| School post (announcement) | React / comment | No | Full | Restricted (15) | Restricted (15) | Restricted (15) | Restricted (15) |
| School post comment | Delete | No | Full | Restricted (17) | Restricted (17) | Restricted (17) | Restricted (17) |
| Class timetable | Create / import / update | No | Full | No | No | No | No |
| Class timetable | View | No | Full | Restricted (4) | Restricted (4) | Restricted (7) | Restricted (7) |
| Teaching schedule | View | No | No | Restricted (9) | Restricted (9) | No | No |
| Class calendar event | Create / update / delete | No | No | Restricted (10) | Restricted (10) | No | No |
| Class calendar event | View | No | No | Restricted (8) | Restricted (8) | Restricted (8) | Restricted (8) |
| Grade structure | Configure / copy | No | Full | No | No | No | No |
| Grade | Enter / import / finalize | No | No | Restricted (11) | Restricted (11) | No | No |
| Grade | Unlock, view change history | No | Full | No | No | No | No |
| Grade, class ranking | View | No | Full (view only) | Restricted (12) | Restricted (12) | Restricted (7) | Restricted (7) |
| Attendance | Take / edit same day | No | No | Restricted (13) | Restricted (13) | No | No |
| Attendance | Edit after the day | No | Full | Restricted (14) | No | No | No |
| Attendance | View | No | Full | Restricted (12) | Restricted (12) | Restricted (7) | Restricted (7) |
| Attendance statistics | View / export | No | Full | Restricted (12) | Restricted (12) | No | No |
| Notification | View | Full | Full | Full | Full | Full | Full |
| Notification read status | View | No | Restricted (18) | Restricted (18) | Restricted (18) | No | No |

Notes:

1. Student, parent and teacher accounts only (not System Admin or School Manager accounts).
2. Name and class only, inside groups they belong to; phone number and email visible to teachers and School Manager only.
3. Lists and members only; School Manager does not see class feeds or chats.
4. Only the classes, groups and teams the user belongs to.
5. Only the class they are homeroom teacher of.
6. School-wide teacher group only.
7. Own data, or the selected child's data.
8. Within the audience chosen by the author.
9. Own teaching schedule only.
10. Teacher: events of their own subjects in classes they teach; homeroom teacher also general events of their class; only the creator updates or deletes.
11. Assigned class and subject only; not after finalizing until School Manager unlocks.
12. Classes they teach (homeroom: also their whole class).
13. Periods they teach, until 23:59 the same day.
14. Their class only; switch between excused and unexcused absence, until the semester is closed.
15. Announcements within the audience chosen by the author; news posts are view only.
16. Own comments and any comment on their own posts; homeroom teacher: any comment in their class groups.
17. Own comments only.
18. Personal notifications about items they created (class events, extracurricular events, school announcements).
