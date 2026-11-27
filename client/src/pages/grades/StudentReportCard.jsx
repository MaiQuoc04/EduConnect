import { useEffect, useState } from 'react';
import { getStudentResults } from '../../api/grades.js';
import Icon from '../../components/Icon.jsx';
import { errorText } from '../../messages.js';
import { fmtResult, fmtScore, LEVELS, RESULT_LONG } from './gradeFormat.js';

// A subject assessed by comments (27/11/2026) shows Đạt / Chưa đạt where a scored subject shows its average.
const isComment = (sub) => sub.assessmentType === 'COMMENT';
const semesterValue = (sub, sem) => (isComment(sub) ? RESULT_LONG[sem?.result] : fmtScore(sem?.average)) || '';
const yearValue = (sub) => (isComment(sub) ? RESULT_LONG[sub.yearResult] : fmtScore(sub.year)) || '';

// UC-88 for one student (SCR-47): every subject's scores and semester / year averages, and the academic level of each
// semester and of the year (Circular 22, Article 9). No overall average and no rank since 23/11/2026. Used by
// students, parents, teachers and SM.

// Tốt / Khá / Đạt / Chưa đạt; "–" while a subject has no average yet.
export function LevelTag({ level, provisional }) {
  const info = LEVELS[level];
  if (!info) return <span className="muted" title="Chưa đủ điểm trung bình các môn">–</span>;
  return (
    <span>
      <span className={`gtag ${info.tone}`}>{info.label}</span>
      {provisional && <span className="caption muted"> (tạm tính)</span>}
    </span>
  );
}

export default function StudentReportCard({ studentId, schoolYearId }) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [detail, setDetail] = useState(''); // semesterId whose scores are shown, '' = none

  useEffect(() => {
    if (!studentId || !schoolYearId) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    getStudentResults(studentId, schoolYearId)
      .then((data) => {
        if (!alive) return;
        setState({ loading: false, data, error: '' });
        setDetail(String(data.semesters[0]?.semesterId ?? ''));
      })
      .catch((err) => alive && setState({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [studentId, schoolYearId]);

  const d = state.data;
  if (state.error) return <p className="form-error">{state.error}</p>;
  if (!d) return <p className="muted">Đang tải…</p>;
  if (!d.class) {
    return (
      <div className="notice">
        <Icon name="info" />
        <p>{d.student.fullName} không học lớp nào trong năm học này.</p>
      </div>
    );
  }
  const detailSemester = d.semesters.find((s) => String(s.semesterId) === detail);

  return (
    <>
      <div className="results-head">
        <h2 className="title-md">
          {d.student.fullName} <span className="muted mono caption">{d.student.studentCode}</span>
        </h2>
        <span className="gtag ink">
          Lớp {d.class.className} · {d.class.yearName}
        </span>
        {d.enrollmentStatus && d.enrollmentStatus !== 'STUDYING' && <span className="gtag">Đã rời lớp</span>}
      </div>

      <div className="results-stats">
        {d.semesters.map((s) => (
          <div key={s.semesterId} className="results-stat">
            <span className="caption muted">Kết quả học tập học kỳ {s.semesterNo}</span>
            <strong>
              <LevelTag level={s.level} provisional={s.provisional} />
            </strong>
          </div>
        ))}
        <div className="results-stat ink">
          <span className="caption muted">Kết quả học tập cả năm</span>
          <strong>
            <LevelTag level={d.year.level} provisional={d.year.provisional} />
          </strong>
        </div>
      </div>
      <p className="caption muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Theo Thông tư 22/2021/TT-BGDĐT: Tốt, Khá, Đạt hoặc Chưa đạt, dựa trên điểm trung bình từng môn và kết quả Đạt / Chưa
        đạt của các môn đánh giá bằng nhận xét.
      </p>
      <ReportTables d={d} detail={detail} setDetail={setDetail} detailSemester={detailSemester} />
    </>
  );
}

function ReportTables({ d, detail, setDetail, detailSemester }) {
  return (
    <>
      <section className="card card-outline" style={{ padding: 0, marginBottom: 24 }}>
        <div className="table-scroll" style={{ border: 0 }}>
          <table className="table report-table">
            <thead>
              <tr>
                <th>Môn học</th>
                {d.semesters.map((s) => (
                  <th key={s.semesterId}>HK{s.semesterNo}</th>
                ))}
                <th>Cả năm</th>
              </tr>
            </thead>
            <tbody>
              {d.subjects.map((sub) => (
                <tr key={sub.subjectId}>
                  <td>{sub.subjectName}</td>
                  {sub.semesters.map((s) => (
                    <td key={s.semesterId}>
                      {s.published === false ? <span className="caption muted">Chưa công bố</span> : semesterValue(sub, s) || <span className="muted">–</span>}
                    </td>
                  ))}
                  <td>
                    <strong>{yearValue(sub) || <span className="muted">–</span>}</strong>
                  </td>
                </tr>
              ))}
              {!d.subjects.length && (
                <tr>
                  <td colSpan={2 + d.semesters.length} className="muted" style={{ textAlign: 'center' }}>
                    Chưa có môn nào được cấu hình điểm.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {d.subjects.length > 0 && (
        <section className="card card-outline">
          <div className="results-head">
            <h3 className="title-sm">Điểm chi tiết</h3>
            <div className="pill-tabs" role="tablist">
              {d.semesters.map((s) => (
                <button key={s.semesterId} type="button" role="tab" aria-selected={String(s.semesterId) === detail} onClick={() => setDetail(String(s.semesterId))}>
                  Học kỳ {s.semesterNo}
                </button>
              ))}
            </div>
          </div>
          <div className="table-scroll" style={{ border: 0 }}>
            <table className="table report-table">
              <thead>
                <tr>
                  <th>Môn học</th>
                  <th className="scores">Điểm thành phần</th>
                  <th>ĐTB</th>
                </tr>
              </thead>
              <tbody>
                {d.subjects.map((sub) => {
                  const sem = sub.semesters.find((s) => String(s.semesterId) === detail);
                  return (
                    <tr key={sub.subjectId}>
                      <td>{sub.subjectName}</td>
                      <td className="scores">
                        {sem?.published === false ? (
                          <span className="muted">Giáo viên chưa chốt điểm môn này</span>
                        ) : sem?.components.length
                          ? sem.components.map((c) => (
                              <div key={c.componentId} className="score-line">
                                <span className="score-label">{c.name}</span>
                                {c.scores.map((x, i) => (
                                  // eslint-disable-next-line react/no-array-index-key -- one cell per attempt, fixed order
                                  <span key={i} className={`score-cell${x === null ? ' empty' : ''}`}>
                                    {x === null ? '–' : isComment(sub) ? fmtResult(x) : fmtScore(x)}
                                  </span>
                                ))}
                              </div>
                            ))
                          : <span className="muted">Chưa có cấu trúc điểm học kỳ {detailSemester?.semesterNo}</span>
                        }
                      </td>
                      <td>
                        <strong>{sem?.published === false ? <span className="muted">–</span> : semesterValue(sub, sem) || <span className="muted">–</span>}</strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
