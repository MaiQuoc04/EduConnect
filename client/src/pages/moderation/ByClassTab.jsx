import { useEffect, useState } from 'react';
import { listByClass } from '../../api/moderation.js';
import { errorText } from '../../messages.js';
import { categoryLabel, formatWhen } from './moderationText.js';
import StatsFilters, { filterParams } from './StatsFilters.jsx';

// Tab "Theo lớp" (moderation phase 6, FE-08 Anh): per class – the student's class at the time of each violation, so a
// promotion or a transfer never moves old numbers – how many violations, how many students with at least one, and the
// category seen most. For a homeroom teacher to remind the class as a whole rather than one student at a time.

export default function ByClassTab({ filters, onFilters }) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: '' }));
    listByClass(filterParams(filters), { signal: controller.signal })
      .then((data) => setState({ loading: false, data, error: '' }))
      .catch((err) => {
        if (!controller.signal.aborted) setState({ loading: false, data: null, error: errorText(err) });
      });
    return () => controller.abort();
  }, [filters]);

  const { data } = state;
  return (
    <section aria-label="Theo lớp">
      <StatsFilters value={filters} onChange={onFilters} fields={['period', 'grade', 'classId', 'category', 'contentType', 'source']} />
      <p className="caption muted mod-toolbar">
        {data && `Từ ${formatWhen(data.from)} đến ${formatWhen(data.to)} · chỉ tính học sinh (lớp tại thời điểm vi phạm)`}
      </p>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <div className="table-scroll card card-outline mod-table-card" aria-busy={state.loading}>
        <table className="table mod-table">
          <thead>
            <tr>
              <th>Khối</th>
              <th>Lớp</th>
              <th>Năm học</th>
              <th className="num">Số lần vi phạm</th>
              <th className="num">Số học sinh vi phạm</th>
              <th>Loại hay gặp nhất</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((c) => (
              <tr key={c.classId}>
                <td>{c.grade}</td>
                <td>{c.className}</td>
                <td>{c.schoolYear}</td>
                <td className="num mono">{c.total}</td>
                <td className="num mono">{c.studentsWithViolation}</td>
                <td>{categoryLabel(c.topCategory)}</td>
              </tr>
            ))}
            {data && !data.items.length && (
              <tr>
                <td colSpan={6} className="empty-row">Không có lớp nào có vi phạm trong khoảng đang lọc.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
