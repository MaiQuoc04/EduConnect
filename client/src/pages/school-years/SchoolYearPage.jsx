import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import SchoolYearDetail from './SchoolYearDetail.jsx';
import SchoolYearForm from './SchoolYearForm.jsx';
import SchoolYearList from './SchoolYearList.jsx';
import { yearLabel } from './schoolYearLabels.js';
import { useSchoolYear, useSchoolYears } from './useSchoolYears.js';

// SCR-18 School Year & Semester – UC-20 Manage School Years (School Manager).
// The selected year lives in ?id= so a reload keeps it; without it the current year (or the newest) is shown.
export default function SchoolYearPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { loading, years, error, reload } = useSchoolYears();
  const [mode, setMode] = useState('view'); // view | create | edit
  const [version, setVersion] = useState(0);

  const requestedId = Number(params.get('id')) || null;
  const fallback = years.find((y) => y.status === 'CURRENT') ?? years[0];
  const selectedId = years.some((y) => y.schoolYearId === requestedId) ? requestedId : fallback?.schoolYearId ?? null;
  const detail = useSchoolYear(selectedId, version);
  const current = years.find((y) => y.status === 'CURRENT');

  function select(id) {
    setMode('view');
    setParams({ id: String(id) });
  }

  async function handleSaved(year, edited) {
    toast(edited ? 'Đã lưu thay đổi năm học.' : `Đã thêm năm học ${yearLabel(year.yearName)}.`);
    await reload();
    setVersion((v) => v + 1);
    select(year.schoolYearId);
  }

  if (loading) return <p className="loading">Đang tải năm học…</p>;
  if (error) return <p className="form-error">{error}</p>;

  let right;
  if (mode === 'create') {
    right = <SchoolYearForm year={null} onSaved={handleSaved} onCancel={() => setMode('view')} />;
  } else if (!selectedId) {
    right = (
      <div className="notice">
        <Icon name="info" />
        <p>Chọn “Thêm năm học” để tạo năm học đầu tiên.</p>
      </div>
    );
  } else if (detail.error) {
    right = <p className="form-error">{detail.error}</p>;
  } else if (!detail.data || detail.data.schoolYearId !== selectedId) {
    right = <p className="loading">Đang tải…</p>;
  } else if (mode === 'edit') {
    right = (
      <SchoolYearForm key={selectedId} year={detail.data} onSaved={handleSaved} onCancel={() => setMode('view')} />
    );
  } else {
    right = <SchoolYearDetail year={detail.data} onEdit={() => setMode('edit')} />;
  }

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Đào tạo</span>/<span className="current">Năm học & học kỳ</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Năm học & Học kỳ</h1>
          <p>Thiết lập thời gian các năm học và học kỳ của trường.</p>
        </div>
        {current && (
          <span className="stamp">
            <Icon name="verified" size="sm" />
            Năm học {yearLabel(current.yearName)}
          </span>
        )}
      </div>

      <div className="year-grid">
        <SchoolYearList
          years={years}
          selectedId={mode === 'create' ? null : selectedId}
          onSelect={select}
          onCreate={() => setMode('create')}
        />
        <div>{right}</div>
      </div>
    </>
  );
}
