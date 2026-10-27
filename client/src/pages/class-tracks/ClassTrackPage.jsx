import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { yearLabel } from '../school-years/schoolYearLabels.js';
import TrackForm from './TrackForm.jsx';
import TrackList from './TrackList.jsx';
import TrackSubjects from './TrackSubjects.jsx';

const LEAVE_TEXT = 'Các thay đổi chưa lưu sẽ bị bỏ. Bạn có muốn tiếp tục?';

// SCR-71 Class Types & Subject Weights – UC-26 Manage Class Types (School Manager).
// Class types are shared by every year; the subjects of a type (weight, periods per week) are set per school year.
// ?schoolYearId= and ?trackId= keep the selection on reload.
export default function ClassTrackPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [years, setYears] = useState([]);
  const [list, setList] = useState({ loading: true, data: null, error: '' });
  const [detail, setDetail] = useState({ data: null, error: '', serial: 0 }); // serial = remount key per fetch
  const [mode, setMode] = useState('view'); // view | create | edit
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [copying, setCopying] = useState(false);

  const yearParam = params.get('schoolYearId') ?? '';
  const trackParam = Number(params.get('trackId')) || null;

  useEffect(() => {
    api
      .get('/school-years')
      .then(({ data }) => setYears(data))
      .catch(() => setYears([]));
  }, []);

  useEffect(() => {
    let alive = true;
    api
      .get('/class-tracks', { params: yearParam ? { schoolYearId: yearParam } : {} })
      .then(({ data }) => alive && setList({ loading: false, data, error: '' }))
      .catch((err) => alive && setList({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [yearParam, version]);

  const schoolYear = list.data?.schoolYear ?? null;
  const tracks = list.data?.tracks ?? [];
  const selectedId = tracks.some((t) => t.trackId === trackParam) ? trackParam : tracks[0]?.trackId ?? null;

  useEffect(() => {
    if (!selectedId) return undefined;
    let alive = true;
    api
      .get(`/class-tracks/${selectedId}/subjects`, {
        params: schoolYear ? { schoolYearId: schoolYear.schoolYearId } : {},
      })
      .then(({ data }) => alive && setDetail((d) => ({ data, error: '', serial: d.serial + 1 })))
      .catch((err) => alive && setDetail((d) => ({ data: null, error: errorText(err), serial: d.serial })));
    return () => {
      alive = false;
    };
  }, [selectedId, schoolYear, version]);

  // Warn before closing the tab with unsaved weights.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const leave = useCallback(
    (next) => {
      if (dirty && !window.confirm(LEAVE_TEXT)) return;
      setDirty(false);
      next();
    },
    [dirty],
  );

  function select(next) {
    const p = {};
    const y = next.schoolYearId ?? yearParam;
    if (y) p.schoolYearId = String(y);
    const t = 'trackId' in next ? next.trackId : selectedId;
    if (t) p.trackId = String(t);
    setParams(p);
  }

  const reload = () => setVersion((v) => v + 1);

  function handleTrackSaved(track, edited) {
    toast(edited ? 'Đã lưu thay đổi loại lớp.' : `Đã thêm loại lớp ${track.trackName}.`);
    setMode('view');
    select({ trackId: track.trackId });
    reload();
  }

  function handleDeleted(track) {
    toast(`Đã xoá loại lớp ${track.trackName}.`);
    setDirty(false);
    select({ trackId: null });
    reload();
  }

  async function handleCopy() {
    const source = list.data?.copySource;
    if (!source || !schoolYear) return;
    setCopying(true);
    try {
      const { data } = await api.post('/class-tracks/copy', {
        fromSchoolYearId: source.schoolYearId,
        toSchoolYearId: schoolYear.schoolYearId,
      });
      toast(`Đã sao chép ${data.copied} thiết lập từ năm học ${yearLabel(source.yearName)}.`);
      setDirty(false);
      reload();
    } catch (err) {
      toast(errorText(err), { type: 'error' });
    } finally {
      setCopying(false);
    }
  }

  if (list.loading && !list.data) return <p className="loading">Đang tải loại lớp…</p>;
  if (list.error) return <p className="form-error">{list.error}</p>;

  const copySource = list.data.copySource;
  const selectedYear = yearParam || (schoolYear ? String(schoolYear.schoolYearId) : '');

  let right;
  if (mode === 'create') {
    right = <TrackForm track={null} onSaved={handleTrackSaved} onCancel={() => setMode('view')} />;
  } else if (!selectedId) {
    right = (
      <div className="notice">
        <Icon name="info" />
        <p>Chọn “Thêm loại lớp” để tạo loại lớp đầu tiên.</p>
      </div>
    );
  } else if (detail.error) {
    right = <p className="form-error">{detail.error}</p>;
  } else if (
    !detail.data ||
    detail.data.track.trackId !== selectedId ||
    detail.data.schoolYear?.schoolYearId !== schoolYear?.schoolYearId
  ) {
    right = <p className="loading">Đang tải…</p>;
  } else if (mode === 'edit') {
    right = (
      <TrackForm key={selectedId} track={detail.data.track} onSaved={handleTrackSaved} onCancel={() => setMode('view')} />
    );
  } else {
    right = (
      <TrackSubjects
        key={detail.serial}
        data={detail.data}
        onSaved={reload}
        onEdit={() => leave(() => setMode('edit'))}
        onDeleted={handleDeleted}
        onDirtyChange={setDirty}
      />
    );
  }

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Đào tạo</span>/<span className="current">Loại lớp & hệ số</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Loại lớp & hệ số môn</h1>
          <p>Mỗi loại lớp có danh sách môn học, hệ số và số tiết mỗi tuần riêng cho từng năm học.</p>
        </div>
        <select
          className="input year-select"
          value={selectedYear}
          onChange={(e) => leave(() => select({ schoolYearId: e.target.value }))}
          aria-label="Năm học"
          disabled={!years.length}
        >
          {!years.length && <option value="">{schoolYear ? `Năm học ${yearLabel(schoolYear.yearName)}` : 'Năm học'}</option>}
          {years.map((y) => (
            <option key={y.schoolYearId} value={y.schoolYearId}>
              Năm học {yearLabel(y.yearName)}
            </option>
          ))}
        </select>
      </div>

      {!schoolYear ? (
        <div className="notice track-note">
          <Icon name="info" />
          <p>Chưa có năm học nào. Hãy tạo năm học trước khi thiết lập môn cho các loại lớp.</p>
        </div>
      ) : schoolYear.ended ? (
        <div className="notice track-note">
          <Icon name="lock" />
          <p>Năm học {yearLabel(schoolYear.yearName)} đã kết thúc nên thiết lập chỉ để xem.</p>
        </div>
      ) : schoolYear.weightsLocked ? (
        <div className="notice amber track-note">
          <Icon name="lock" />
          <p>
            Năm học {yearLabel(schoolYear.yearName)} đã có điểm nên không thể thêm, bỏ môn hoặc đổi hệ số. Số tiết
            mỗi tuần vẫn chỉnh được.
          </p>
        </div>
      ) : !schoolYear.configured && copySource ? (
        <div className="confirm-box ink track-note">
          <div className="confirm-head">
            <Icon name="content_copy" />
            <div>
              <p className="notice-title">Năm học {yearLabel(schoolYear.yearName)} chưa có thiết lập môn</p>
              <p>
                Sao chép môn học, hệ số và số tiết của tất cả loại lớp từ năm học {yearLabel(copySource.yearName)},
                sau đó chỉnh lại nếu cần.
              </p>
            </div>
          </div>
          <div className="card-footer">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => leave(handleCopy)}
              disabled={copying}
            >
              {copying ? 'Đang sao chép…' : `Sao chép từ năm học ${yearLabel(copySource.yearName)}`}
            </button>
          </div>
        </div>
      ) : null}

      <div className="year-grid">
        <TrackList
          tracks={tracks}
          selectedId={mode === 'create' ? null : selectedId}
          onSelect={(id) =>
            leave(() => {
              setMode('view');
              select({ trackId: id });
            })
          }
          onCreate={() => leave(() => setMode('create'))}
        />
        <div>{right}</div>
      </div>
    </>
  );
}
