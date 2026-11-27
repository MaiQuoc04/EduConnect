import { useEffect, useId, useState } from 'react';
import { api } from '../../api/client.js';
import { CONTENT_TYPE_TEXT, ROLE_TEXT, SOURCE_TEXT, VIOLATION_CATEGORIES, categoryLabel } from './moderationText.js';

// The shared filters of the "Quy chuẩn cộng đồng" statistics (moderation phase 6): a period, grade, class, role,
// category, content type, how it was found, and a name (accent-free on the server). Controlled: value / onChange.
// `fields` picks the ones a tab uses (the rules tab only needs the period).

const VN_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }); // YYYY-MM-DD, Vietnam time
const today = () => VN_DAY.format(new Date());
function shift(day, days) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The period presets: [from, to] (null = server default, the last 30 days). */
const PERIODS = {
  DAYS_30: { label: '30 ngày gần nhất', range: () => [null, null] },
  DAYS_7: { label: '7 ngày gần nhất', range: () => [shift(today(), -6), today()] },
  MONTH: { label: 'Tháng này', range: () => [`${today().slice(0, 8)}01`, today()] },
  CUSTOM: { label: 'Tự chọn', range: null },
};

export const EMPTY_FILTERS = Object.freeze({
  period: 'DAYS_30', from: '', to: '', grade: '', classId: '', role: '', category: '', contentType: '', source: '', search: '',
});

/** The query parameters of the filters (empty ones are dropped by the API layer). */
export function filterParams(f) {
  const [from, to] = f.period === 'CUSTOM' ? [f.from, f.to] : PERIODS[f.period].range();
  const { period: _period, from: _from, to: _to, ...rest } = f;
  return { ...rest, from, to };
}

const ALL = ['period', 'grade', 'classId', 'role', 'category', 'contentType', 'source', 'search'];

export default function StatsFilters({ value, onChange, fields = ALL }) {
  const id = useId();
  const [classes, setClasses] = useState([]);
  const [search, setSearch] = useState(value.search);
  const has = (name) => fields.includes(name);
  const set = (patch) => onChange({ ...value, ...patch });

  useEffect(() => {
    if (!has('classId')) return;
    api.get('/classes').then(({ data }) => setClasses(data.classes ?? [])).catch(() => setClasses([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The name filter waits for a short pause in typing.
  useEffect(() => {
    if (search === value.search) return undefined;
    const timer = setTimeout(() => set({ search }), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const shownClasses = value.grade ? classes.filter((c) => c.gradeLevel === value.grade) : classes;

  const select = (name, label, options) => (
    <div className="field mod-filter">
      <label htmlFor={`${id}-${name}`} className="field-label">{label}</label>
      <select
        id={`${id}-${name}`}
        className="input"
        value={value[name]}
        // another grade clears the class (it may not be of that grade)
        onChange={(e) => set(name === 'grade' ? { grade: e.target.value, classId: '' } : { [name]: e.target.value })}
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>{text}</option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="mod-filters" role="group" aria-label="Bộ lọc">
      {has('period') && select('period', 'Khoảng thời gian', Object.entries(PERIODS).map(([k, p]) => [k, p.label]))}
      {has('period') && value.period === 'CUSTOM' && (
        <>
          <div className="field mod-filter">
            <label htmlFor={`${id}-from`} className="field-label">Từ ngày</label>
            <input id={`${id}-from`} type="date" className="input" value={value.from} max={value.to || undefined} onChange={(e) => set({ from: e.target.value })} />
          </div>
          <div className="field mod-filter">
            <label htmlFor={`${id}-to`} className="field-label">Đến ngày</label>
            <input id={`${id}-to`} type="date" className="input" value={value.to} min={value.from || undefined} onChange={(e) => set({ to: e.target.value })} />
          </div>
        </>
      )}
      {has('grade') && select('grade', 'Khối', [['', 'Tất cả'], ['10', 'Khối 10'], ['11', 'Khối 11'], ['12', 'Khối 12']])}
      {has('classId') && select('classId', 'Lớp', [['', 'Tất cả'], ...shownClasses.map((c) => [String(c.classId), c.className])])}
      {has('role') && select('role', 'Vai trò', [['', 'Tất cả'], ...Object.entries(ROLE_TEXT)])}
      {has('category') && select('category', 'Loại vi phạm', [['', 'Tất cả'], ...VIOLATION_CATEGORIES.map((c) => [c, categoryLabel(c)])])}
      {has('contentType') && select('contentType', 'Nguồn', [['', 'Tất cả'], ...Object.entries(CONTENT_TYPE_TEXT)])}
      {has('source') && select('source', 'Cách phát hiện', [['', 'Tất cả'], ...Object.entries(SOURCE_TEXT)])}
      {has('search') && (
        <div className="field mod-filter mod-filter-search">
          <label htmlFor={`${id}-search`} className="field-label">Họ tên</label>
          <input id={`${id}-search`} type="search" className="input" value={search} maxLength={100} placeholder="Tìm theo họ tên…" onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}
    </div>
  );
}
