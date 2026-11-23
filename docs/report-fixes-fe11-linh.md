# R3 / R4 fixes after the FE-11 change (owner: Linh)

Source: the lead's review on 23/11/2026 of the Drive drafts in "Project Reports / Nháp" (`R3_SRS_draft.docx`,
`R4_SDS_draft.docx`) against the code on `develop` after the merge of `feature/fe-11-grade-management` (`b30b570`).
Edit the **Drive copy** (it is the master); tick each item when done and add one Change Log line per report.

**What changed in the code (for reference):** no overall average of all subjects and no ranking any more (Circular 22
does not compare students). Each student gets an **academic level** per semester and for the year (Circular 22,
Article 9), from the **rounded** subject averages of the period:
- **Tốt (GOOD):** every subject ≥ 6.5 and at least 6 subjects ≥ 8.0
- **Khá (FAIR):** every subject ≥ 5.0 and at least 6 subjects ≥ 6.5
- **Đạt (PASS):** at least 6 subjects ≥ 5.0 and no subject below 3.5
- **Chưa đạt (FAIL):** otherwise
- no level while a subject of the period has no average yet; "tạm tính" (provisional) while a book is not finalized.

UC-89 View Class Ranking and SCR-48 Class Ranking are removed (`/grades/ranking` redirects to `/grades/results`).
Code: `server/src/modules/grades/grades.calc.js` (`academicLevel`, unit tests in `grades.calc.test.js`),
`results.service.js`; client `pages/grades/GradeResultsPage.jsx`, `StudentReportCard.jsx`, `gradeFormat.js`.

> Note: the Drive text export can lag behind the latest edits. The R3 Change Log of 23/11 says some of these were
> already done, but the export still showed the old text – check each place on Drive; skip what is already right.

## R3 – SRS (`R3_SRS_draft.docx`)

- [ ] **1. I.4 Use cases per actor – Teacher list ("60 use cases")**
  - Now: contains "UC-89 View Class Ranking".
  - Fix: remove UC-89 and change the count to 59. Check the School Manager, Student and Parent lists too.
- [ ] **2. I.5 Screens per role** (School Manager 61, Teacher 37, Student 28, Parent 29 screens)
  - Now: all four lists contain "SCR-48 Class Ranking".
  - Fix: remove SCR-48 from each list and lower each count by 1.
- [ ] **3. Screen list table, row 48**
  - Now: "Class Ranking – Displays class ranking information according to the User's permissions."
  - Fix (same as `docs/screens.md`): "Class Ranking – **Removed 23/11/2026** (Circular 22 does not compare students):
    the academic level of each student is shown on SCR-47."
- [ ] **4. II UC specification UC-85 Finalize Grades – Postconditions**
  - Now: "… Students and parents see the finalized scores, averages and class ranking shown to students and parents
    (UC-88, UC-89)."
  - Fix: "… Students and parents see the finalized scores, the subject averages and the academic level (UC-88)."
- [ ] **5. III.11.3 heading**
  - Now: "Results & Ranking". Fix: "Academic Results". (In the UC table the sub-feature of UC-88 / UC-128 should read
    the same; `docs/use-cases.md` still says "Results & Ranking" – keep both in step.)
- [ ] **6. III.11.3.1 Academic Results (SCR-47) – field "Bảng kết quả lớp"**
  - Now: "… one column per subject average, ĐTB chung, Hạng …".
  - Fix: "Teacher / School Manager, read only: student (link to the student's report card), one column per subject
    average and a column **Kết quả học tập** (Tốt / Khá / Đạt / Chưa đạt) for the period selected; year average of a
    subject = (HK1 + 2 × HK2) / 3; students who left the class …" (keep the rest of the current sentence).
- [ ] **7. SCR-47 – field "Thẻ tổng hợp"**
  - Now: "ĐTB học kỳ 1, ĐTB học kỳ 2, ĐTB cả năm, each with the student's own rank 'Hạng n/m' …".
  - Fix: "Read only: class and school year; the academic level of Học kỳ 1, Học kỳ 2 and Cả năm (Tốt / Khá / Đạt /
    Chưa đạt, '(tạm tính)' while a book is not finalized)."
- [ ] **8. SCR-47 – field "Thông báo"**
  - Now: "Một số sổ điểm của kỳ này chưa chốt, điểm trung bình và thứ hạng đang là tạm tính."
  - Fix (exact UI text): "Một số sổ điểm của kỳ này chưa chốt, điểm trung bình và mức đánh giá đang là tạm tính."
- [ ] **9. SCR-47 – screenshot** (PHỤ TRÁCH box still empty): take it after this change (column "Kết quả học tập", no
  "ĐTB chung" / "Hạng"), for a teacher and for a student / parent.
- [ ] **10. III.11.3.2 Class Ranking (SCR-48)**
  - Now: the whole section is still there (fields "Bảng xếp hạng", "Thứ hạng của tôi").
  - Fix: delete the section, or leave one line "SCR-48 Class Ranking – removed 23/11/2026, see SCR-47."
- [ ] **11. Business rules table – GBR-31**
  - Now: "Students and parents see only finalized grade books and only their own rank …" / use cases "View Grades,
    Class Ranking (UC-88, UC-89)".
  - Fix: "… see only finalized grade books and only their own results …" / use cases "View Grades (UC-88)".
- [ ] **12. Business rules table – GBR-43 (new)**
  - Now: announced in the Change Log of 23/11, but no GBR-43 row was found in the text export.
  - Fix: add (or check) the row: "GBR-43 | Academic level | Each student gets an academic level per semester and for
    the year from the rounded subject averages (Circular 22, Article 9): Tốt = every subject ≥ 6.5 and at least 6
    subjects ≥ 8.0; Khá = every subject ≥ 5.0 and at least 6 subjects ≥ 6.5; Đạt = at least 6 subjects ≥ 5.0 and none
    below 3.5; Chưa đạt = otherwise; no level while a subject has no average; provisional while a book is not
    finalized. No overall average and no ranking. | View Grades (UC-88)".
- [ ] **13. Counts** – after removing UC-89 / SCR-48, write the totals the same way everywhere (agree with the lead):
  e.g. "132 use cases (UC-89 removed)" and "84 screens (SCR-48 removed)".

Already right in the export (no action): BF-11 (I.2.11), BR-38, the Student / Parent role descriptions, the UC-88 row
of the UC table, the permission matrix row "Grade, academic level", and UC-89 is gone from the UC table.

## R4 – SDS (`R4_SDS_draft.docx`)

- [ ] **14. I.2 Package Diagram – module table, row 18 `grades`**
  - Now: "Grade structure, grade book, import, finalize / unlock, results, ranking, averages (grades.calc.js)."
  - Fix: "Grade structure, grade book, import, finalize / unlock, results: subject averages and the academic level
    (grades.calc.js)." If the package diagram picture shows "ranking", redraw that box too.
- [ ] **15. IV.4 Grade Calculation and Grade Book Lifecycle** (Linh's section, still a placeholder) – include:
  - subject semester average = weighted average of the scores present; year average = (HK1 + 2 × HK2) / 3; rounding
    to one decimal at each step, each step using the rounded result of the step before;
  - the academic level (`academicLevel()`, thresholds above) decided on the rounded subject averages; null while a
    subject has no average;
  - nothing is stored: averages and levels are computed when shown; "tạm tính" while a book of the period is not
    finalized; students / parents see finalized books only;
  - finalize / unlock (`grade_locks`), every change in `grade_histories`;
  - unit tests: `grades.calc.test.js` (rounding, year average, the four levels and the "fewer than 6 subjects" case).

## Code (small)

- [ ] **16.** `server/src/modules/grades/results.service.js`, the comment above the class results (≈ line 264) says
  "UC-89 shows the levels of the class since 23/11/2026" while UC-89 is removed – reword to "UC-88: the class view
  shows the academic level of each student (no ranking)".

## Open (lead's decision, not for this round)

Subjects assessed by comments (Đạt / Chưa đạt), conduct (rèn luyện) and the titles Học sinh Giỏi / Xuất sắc need
schema changes; until decided, R3 / R4 should say they are **not handled** (as business rules §11 does).
