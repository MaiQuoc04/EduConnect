import { Link } from 'react-router-dom';
import { GROUP_TYPE_LABELS } from '../groups/groupLabels.js';

// SCR-22 table view (UC-29): every shown class on one row, for scanning many classes at once.
export default function ClassTable({ classes, loading }) {
  return (
    <div className={`card card-outline class-table${loading ? ' is-loading' : ''}`}>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Lớp</th>
              <th>Loại lớp</th>
              <th>Giáo viên chủ nhiệm</th>
              <th className="num">Sĩ số</th>
              <th>Nhóm trực thuộc</th>
            </tr>
          </thead>
          <tbody>
            {classes.map((c) => (
              <tr key={c.classId}>
                <td className="subject-name">
                  {c.className} <span className="muted caption">· Khối {c.gradeLevel}</span>
                </td>
                <td>{c.trackName}</td>
                <td>
                  {c.homeroomName ? (
                    <>
                      {c.homeroomName}
                      {c.homeroomStatus === 'LOCKED' && <span className="pill red"> Đã khoá</span>}
                    </>
                  ) : (
                    <span className="class-warn">Chưa có giáo viên chủ nhiệm</span>
                  )}
                </td>
                <td className="num">{c.studentCount} học sinh</td>
                <td>
                  <span className="chips">
                    {c.groups.map((g) => (
                      <Link key={g.groupId} to={`/groups/${g.groupId}/members`} className="chip chip-link" title={g.groupName}>
                        {GROUP_TYPE_LABELS[g.groupType]} · {g.memberCount}
                      </Link>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
