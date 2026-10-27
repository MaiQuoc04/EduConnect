import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import Icon from '../../components/Icon.jsx';
import { errorText } from '../../messages.js';
import { yearLabel } from '../school-years/schoolYearLabels.js';
import GroupLink from './GroupLink.jsx';

// SCR-22 Group List – UC-29 View Group List for teachers, students and parents ("Nhóm của tôi"): the groups they
// belong to, one card per class. The School Manager uses the class view at /classes.
export default function GroupListPage() {
  const [params, setParams] = useSearchParams();
  const yearParam = params.get('schoolYearId') ?? '';
  const [state, setState] = useState({ loading: true, data: null, error: '' });

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    api
      .get('/groups', { params: yearParam ? { schoolYearId: yearParam } : {} })
      .then(({ data }) => alive && setState({ loading: false, data, error: '' }))
      .catch((err) => alive && setState({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [yearParam]);

  const data = state.data;
  const schoolYear = data?.schoolYear ?? null;
  const empty = data && !data.classes.length && !data.teacherGroup;

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Cộng đồng</span>/<span className="current">Nhóm của tôi</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Nhóm của tôi</h1>
          <p>Các nhóm lớp bạn đang tham gia.</p>
        </div>
        {data?.schoolYears.length > 1 && (
          <select
            className="input year-select"
            aria-label="Năm học"
            value={yearParam || (schoolYear ? String(schoolYear.schoolYearId) : '')}
            onChange={(e) => setParams({ schoolYearId: e.target.value })}
          >
            {data.schoolYears.map((y) => (
              <option key={y.schoolYearId} value={y.schoolYearId}>
                Năm học {yearLabel(y.yearName)}
              </option>
            ))}
          </select>
        )}
      </div>

      {state.error ? (
        <p className="form-error">{state.error}</p>
      ) : state.loading && !data ? (
        <p className="loading">Đang tải nhóm…</p>
      ) : empty ? (
        <div className="notice">
          <Icon name="info" />
          <p>Bạn chưa thuộc nhóm lớp nào. Khi nhà trường xếp lớp, các nhóm của lớp sẽ hiện ở đây.</p>
        </div>
      ) : (
        <div className={`group-grid${state.loading ? ' is-loading' : ''}`}>
          {data.teacherGroup && (
            <section className="card card-outline group-card">
              <div className="group-card-head">
                <div>
                  <p className="label-upper muted">Toàn trường</p>
                  <h2 className="title-md">{data.teacherGroup.groupName}</h2>
                </div>
              </div>
              <GroupLink group={data.teacherGroup} />
            </section>
          )}
          {data.classes.map((c) => (
            <section key={c.classId} className="card card-outline group-card">
              <div className="group-card-head">
                <div>
                  <p className="label-upper muted">
                    Khối {c.gradeLevel} · Năm học {yearLabel(schoolYear.yearName)}
                  </p>
                  <h2 className="title-md">Lớp {c.className}</h2>
                </div>
                {schoolYear.ended && <span className="pill">Chỉ xem</span>}
              </div>
              <p className="caption muted">
                {c.homeroomName ? (
                  <>
                    Giáo viên chủ nhiệm: {c.homeroomName}
                    {c.homeroomStatus === 'LOCKED' && ' (đã khoá)'}
                  </>
                ) : (
                  <span className="class-warn">Lớp chưa có giáo viên chủ nhiệm</span>
                )}
              </p>
              <div className="group-links">
                {c.groups.map((g) => (
                  <GroupLink key={g.groupId} group={g} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
