import Icon from '../../components/Icon.jsx';
import { formatDob, GENDER_LABELS, MAX_CLASS_SIZE, reviewWarnings } from './studentPick.js';
import { StudentInfo } from './StudentPicker.jsx';

const names = (list) => list.map((s) => s.fullName).join(', ');

// UC-28 last step: who will join the class, with what to double-check. Warnings never block the save; the class
// size (agreed 29/10: at most 45) is also checked by the server.
export default function StudentReview({ students, grade, currentCount = 0, onRemove }) {
  const total = currentCount + students.length;
  const male = students.filter((s) => s.gender === 'MALE').length;
  const female = students.filter((s) => s.gender === 'FEMALE').length;
  const w = reviewWarnings(students, grade);
  const sorted = [...students].sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'));

  return (
    <div className="review">
      <dl className="import-stats review-stats">
        <div>
          <dt>Học sinh thêm vào</dt>
          <dd>{students.length}</dd>
        </div>
        <div>
          <dt>Sĩ số sau khi lưu</dt>
          <dd>
            {total}
            <span className="muted review-max">/{MAX_CLASS_SIZE}</span>
          </dd>
        </div>
        <div>
          <dt>Nam</dt>
          <dd>{male}</dd>
        </div>
        <div>
          <dt>Nữ</dt>
          <dd>{female}</dd>
        </div>
      </dl>

      {(w.otherGrade.length > 0 || w.sameName.length > 0 || w.locked.length > 0 || w.noParent.length > 0) && (
        <div className="import-rows warn">
          <p className="notice-title">
            <Icon name="warning" size="sm" />
            Cần xem lại trước khi lưu
          </p>
          <ul>
            {w.otherGrade.length > 0 && (
              <li>
                <span>
                  <strong>{w.otherGrade.length} học sinh có lớp cũ không liền kề khối {grade}:</strong>{' '}
                  {w.otherGrade.map((s) => `${s.fullName} (lớp cũ ${s.previousClassName})`).join(', ')}
                </span>
              </li>
            )}
            {w.sameName.map((group) => (
              <li key={group[0].studentId}>
                <span>
                  <strong>Trùng họ tên “{group[0].fullName}”:</strong>{' '}
                  {group.map((s) => `${s.studentCode}, sinh ${formatDob(s.dob) || '—'}`).join('; ')}. Giáo viên chủ nhiệm
                  có thể đặt biệt danh để phân biệt.
                </span>
              </li>
            ))}
            {w.locked.length > 0 && (
              <li>
                <span>
                  <strong>{w.locked.length} tài khoản đang bị khoá:</strong> {names(w.locked)}
                </span>
              </li>
            )}
            {w.noParent.length > 0 && (
              <li>
                <span>
                  <strong>{w.noParent.length} học sinh chưa liên kết phụ huynh</strong> nên nhóm phụ huynh chưa có phụ
                  huynh của các em: {names(w.noParent)}
                </span>
              </li>
            )}
          </ul>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="notice">
          <Icon name="info" />
          <p>Chưa chọn học sinh nào. Lớp được tạo trống, có thể thêm học sinh sau.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="table review-table">
            <thead>
              <tr>
                <th className="num">STT</th>
                <th>Học sinh</th>
                <th>Giới tính</th>
                <th>Ngày sinh</th>
                {onRemove && <th aria-label="Bỏ" />}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => (
                <tr key={s.studentId}>
                  <td className="num mono">{i + 1}</td>
                  <td>
                    <StudentInfo student={s} grade={grade} />
                  </td>
                  <td>{GENDER_LABELS[s.gender] ?? '—'}</td>
                  <td className="mono">{formatDob(s.dob) || '—'}</td>
                  {onRemove && (
                    <td>
                      <button type="button" className="chip-remove" onClick={() => onRemove(s)} aria-label={`Bỏ ${s.fullName}`}>
                        <Icon name="close" size="sm" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
