import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  createClassEvent, getClassEvent, getClassEventOptions, getClassPeople,
} from '../../api/classEvents.js';
import { getClassWeek } from '../../api/timetables.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { foldVietnamese } from '../../utils/teacherValidation.js';
import { dmy, hm, isoDate, styleOf } from './calendarUtils.js';
import './calendar.css';

// SCR-40 Create Calendar Event / SCR-42 Update Calendar Event – UC-78 / UC-79 (FE-10, Teacher), Stitch design.
// Business rules §10: own subject (assignment on the event's day); general event = homeroom teacher only; audience
// = tick boxes and/or people picked one by one; only the creator edits, before the event starts.

const TITLE_MAX = 255;
const DESCRIPTION_MAX = 2000;
const GENERAL = 'general';
const PEOPLE_TABS = [['students', 'Học sinh'], ['parents', 'Phụ huynh'], ['teachers', 'Giáo viên']];

function PeoplePicker({ classId, selected, onChange, onClose }) {
  const [people, setPeople] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('students');
  const [q, setQ] = useState('');
  useEffect(() => {
    getClassPeople(classId).then(setPeople).catch((err) => setError(errorText(err)));
  }, [classId]);
  const list = (people?.[tab] ?? []).filter((p) => !q.trim() || foldVietnamese(`${p.name} ${p.children ?? ''} ${p.code ?? ''}`).includes(foldVietnamese(q.trim())));
  const toggle = (id) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    onChange(n);
  };
  return (
    <div className="cal-picker-panel">
      <div className="cal-picker-top">
        <div className="cal-seg is-small" role="tablist">
          {PEOPLE_TABS.map(([k, t]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {t}{people ? ` (${people[k].length})` : ''}
            </button>
          ))}
        </div>
        <button type="button" className="cal-link" onClick={onClose}>Xong</button>
      </div>
      <label className="cal-search"><Icon name="search" size="sm" />
        <input type="search" value={q} maxLength={50} placeholder="Tìm theo tên…" onChange={(e) => setQ(e.target.value)} aria-label="Tìm người" />
      </label>
      {error && <p className="field-error">{error}</p>}
      {!people && !error && <p className="cal-muted cal-small">Đang tải…</p>}
      <ul className="cal-picker-list">
        {people && list.length === 0 && <li className="cal-muted cal-small">Không có ai phù hợp.</li>}
        {list.map((p) => (
          <li key={p.userId}>
            <label>
              <input type="checkbox" checked={selected.has(String(p.userId))} onChange={() => toggle(String(p.userId))} />
              <span><strong>{p.name}</strong>
                <em>{p.code ?? (p.children ? `Phụ huynh của ${p.children}` : `${p.isHomeroom ? 'Chủ nhiệm · ' : ''}${p.subjects}`)}</em>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CalendarEventFormPage() {
  const { eventId } = useParams();
  const editing = !!eventId;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [options, setOptions] = useState(null);
  const [original, setOriginal] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(null);
  const [initial, setInitial] = useState('');
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lesson, setLesson] = useState(null);

  // Load the form data (and the event when editing).
  useEffect(() => {
    (async () => {
      try {
        const o = await getClassEventOptions();
        setOptions(o);
        let f;
        if (editing) {
          const ev = await getClassEvent(eventId);
          setOriginal(ev);
          f = {
            classId: String(ev.classId), subjectId: ev.subjectId ? String(ev.subjectId) : GENERAL, categoryId: String(ev.categoryId),
            title: ev.title, description: ev.description ?? '', date: ev.startAt.slice(0, 10), start: hm(ev.startAt),
            end: ev.endAt && ev.endAt.slice(0, 10) === ev.startAt.slice(0, 10) ? hm(ev.endAt) : '',
            forStudents: ev.forStudents, forParents: ev.forParents, forSubjectTeachers: ev.forSubjectTeachers,
            viewerIds: new Set((ev.viewers ?? []).map((v) => String(v.userId))),
          };
        } else {
          const cls = o.classes.find((c) => String(c.classId) === params.get('classId')) ?? o.classes[0];
          const today = o.now.slice(0, 10);
          const date = isoDate(params.get('date')) && params.get('date') >= today ? params.get('date') : today;
          f = {
            classId: cls ? String(cls.classId) : '', subjectId: '', categoryId: String(o.categories[0]?.categoryId ?? ''),
            title: '', description: '', date, start: '', end: '',
            forStudents: true, forParents: false, forSubjectTeachers: false, viewerIds: new Set(),
          };
        }
        setForm(f);
        setInitial(JSON.stringify({ ...f, viewerIds: [...f.viewerIds].sort() }));
      } catch (err) {
        setLoadError(errorText(err));
      }
    })();
  }, [editing, eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cls = options?.classes.find((c) => String(c.classId) === form?.classId);
  // Subjects of the teacher in this class on the chosen day (+ "general" for the homeroom teacher).
  const subjects = useMemo(() => {
    if (!cls || !form) return [];
    const seen = new Map();
    for (const s of cls.subjects) {
      const covers = !form.date || (s.from <= form.date && form.date <= s.to);
      const prev = seen.get(String(s.subjectId));
      if (!prev || covers) seen.set(String(s.subjectId), { ...s, covers });
    }
    return [...seen.values()];
  }, [cls, form]);

  // Default subject when the class changes: first subject taught that day, else general (homeroom), else the first.
  useEffect(() => {
    if (!form || !cls) return;
    const valid = form.subjectId === GENERAL ? cls.isHomeroom : subjects.some((s) => String(s.subjectId) === form.subjectId);
    if (!valid) {
      const first = subjects.find((s) => s.covers) ?? subjects[0];
      setForm((f) => ({ ...f, subjectId: first ? String(first.subjectId) : cls.isHomeroom ? GENERAL : '' }));
    }
  }, [cls, subjects]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Khớp lịch học": the class's lesson at that date and time (FE-10 timetable).
  useEffect(() => {
    setLesson(null);
    if (!form?.classId || !isoDate(form.date) || !form.start) return undefined;
    let alive = true;
    getClassWeek(form.classId, form.date)
      .then((w) => {
        if (!alive) return;
        setLesson(w.lessons.find((l) => l.date === form.date && l.start <= form.start && form.start < l.end) ?? null);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [form?.classId, form?.date, form?.start]); // eslint-disable-line react-hooks/exhaustive-deps

  const snapshot = form ? JSON.stringify({ ...form, viewerIds: [...form.viewerIds].sort() }) : '';
  const dirty = !!form && snapshot !== initial;
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (loadError) {
    return <div className="cal-page"><div className="notice amber"><Icon name="error_outline" /><div><p>{loadError}</p><Link to="/calendar" className="btn btn-secondary">Về lịch lớp</Link></div></div></div>;
  }
  if (!form || !options) return <div className="cal-page" aria-busy="true"><p className="cal-muted">Đang tải…</p></div>;
  if (editing && original && !original.canEdit) {
    return (
      <div className="cal-page">
        <div className="notice"><Icon name="lock" /><div>
          <p>{original.isMine ? 'Sự kiện đã bắt đầu nên không sửa được nữa.' : 'Chỉ người tạo mới được sửa sự kiện này.'}</p>
          <Link to={`/calendar/events/${eventId}`} className="btn btn-secondary">Xem sự kiện</Link>
        </div></div>
      </div>
    );
  }
  if (!editing && options.classes.length === 0) {
    return <div className="cal-page"><div className="notice"><Icon name="info" /><p>Bạn chưa chủ nhiệm hoặc được phân công dạy lớp nào trong năm học này nên chưa tạo được sự kiện.</p></div></div>;
  }

  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setSaveError(null); };
  const now = options.now;
  const startAt = form.date && form.start ? `${form.date}T${form.start}` : '';
  const problems = {
    title: !form.title.trim() ? 'Vui lòng nhập tiêu đề sự kiện.' : '',
    time: !form.date || !form.start ? 'Chọn ngày và giờ bắt đầu.'
      : startAt <= now ? 'Thời gian bắt đầu phải sau thời điểm hiện tại.'
        : cls && form.date > cls.yearEnd ? `Sự kiện phải nằm trong năm học (đến ${dmy(cls.yearEnd)}).`
          : form.end && form.end <= form.start ? 'Giờ kết thúc phải sau giờ bắt đầu.' : '',
    subject: !form.subjectId ? 'Bạn không có môn nào được phân công ở lớp này vào ngày đã chọn.'
      : form.subjectId !== GENERAL && !subjects.find((s) => String(s.subjectId) === form.subjectId)?.covers
        ? `Bạn không được phân công dạy môn này vào ngày ${dmy(form.date)}.` : '',
    description: form.description.length > DESCRIPTION_MAX ? `Mô tả tối đa ${DESCRIPTION_MAX} ký tự.` : '',
  };
  const invalid = Object.values(problems).some(Boolean);
  const noAudience = !form.forStudents && !form.forParents && !form.forSubjectTeachers && form.viewerIds.size === 0;
  const fieldError = (code) => (saveError?.code === code ? errorText(saveError) : '');

  async function submit(e) {
    e.preventDefault();
    if (invalid || saving) return;
    setSaving(true);
    setSaveError(null);
    const body = {
      subjectId: form.subjectId === GENERAL ? null : Number(form.subjectId),
      categoryId: Number(form.categoryId),
      title: form.title,
      description: form.description,
      startAt,
      endAt: form.end ? `${form.date}T${form.end}` : null,
      forStudents: form.forStudents,
      forParents: form.forParents,
      forSubjectTeachers: form.forSubjectTeachers,
      viewerIds: [...form.viewerIds].map(Number),
    };
    try {
      const saved = await createClassEvent({ ...body, classId: Number(form.classId) });
      setInitial(snapshot);
      toast(editing ? 'Đã lưu thay đổi sự kiện.' : 'Đã tạo sự kiện. Người được xem đã nhận thông báo.');
      navigate(`/calendar/events/${saved.eventId}`);
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  }

  const back = editing ? `/calendar/events/${eventId}` : `/calendar?date=${form.date}`;

  return (
    <div className="cal-page cal-page-narrow">
      <nav className="cal-crumb" aria-label="Breadcrumb">
        <span>EduConnect</span><span>/</span><span>Lớp &amp; Thời khoá biểu</span><span>/</span>
        <Link to={`/calendar${form.classId ? `?classId=${form.classId}` : ''}`}>Lịch lớp{cls ? ` ${cls.className}` : ''}</Link><span>/</span>
        <strong>{editing ? 'Sửa sự kiện' : 'Tạo sự kiện'}</strong>
      </nav>
      <div className="cal-head">
        <div>
          <div className="cal-title-row">
            <h1 className="headline-lg">{editing ? 'Sửa sự kiện' : 'Tạo sự kiện lớp'}</h1>
            {dirty && <span className="cal-class-tag is-draft">Chưa lưu</span>}
          </div>
          {editing ? (
            <p>Lớp {original.className} · Người tạo: <strong>{original.createdByName}</strong> · Tạo ngày {dmy(original.createdAt)}
              {original.updatedAt ? ` · Sửa gần nhất ${hm(original.updatedAt)} ${dmy(original.updatedAt)}` : ''}</p>
          ) : <p>Sự kiện hiện trên lịch lớp của những người bạn chọn; họ nhận thông báo ngay và được nhắc trước 1 ngày.</p>}
        </div>
      </div>

      <form className="cal-form" onSubmit={submit} noValidate>
        <div className="cal-form-row">
          <div className="cal-field">
            <label htmlFor="ev-class">Lớp áp dụng <span className="cal-req">*</span>
              <span className="cal-hint">{editing ? 'Không đổi lớp khi sửa' : 'Chỉ các lớp bạn chủ nhiệm hoặc giảng dạy'}</span></label>
            <div className="cal-select">
              <select id="ev-class" value={form.classId} disabled={editing} onChange={(e) => set({ classId: e.target.value, viewerIds: new Set() })}>
                {editing && !cls && <option value={form.classId}>Lớp {original.className}</option>}
                {options.classes.map((c) => <option key={c.classId} value={c.classId}>Lớp {c.className} · {c.isHomeroom ? 'GVCN' : 'Giáo viên bộ môn'}</option>)}
              </select>
              <Icon name={editing ? 'lock' : 'expand_more'} size="sm" />
            </div>
          </div>
          <div className="cal-field">
            <label htmlFor="ev-subject">Môn học <span className="cal-req">*</span>
              {cls?.isHomeroom && <span className="cal-hint is-ink">GVCN được tạo sự kiện chung</span>}</label>
            <div className="cal-select">
              <select id="ev-subject" value={form.subjectId} onChange={(e) => set({ subjectId: e.target.value })}>
                {!form.subjectId && <option value="">— Không có môn —</option>}
                {cls?.isHomeroom && <option value={GENERAL}>Chung của lớp (không theo môn)</option>}
                {subjects.map((s) => (
                  <option key={s.subjectId} value={s.subjectId}>{s.name}{s.covers ? '' : ` (phân công ${dmy(s.from)} – ${dmy(s.to)})`}</option>
                ))}
              </select>
              <Icon name="expand_more" size="sm" />
            </div>
            {problems.subject && <p className="field-error">{problems.subject}</p>}
            {fieldError('MSG_EVENT_SUBJECT_NOT_TAUGHT') && <p className="field-error">{fieldError('MSG_EVENT_SUBJECT_NOT_TAUGHT')}</p>}
          </div>
        </div>

        <div className="cal-field">
          <span className="cal-label">Loại sự kiện <span className="cal-req">*</span></span>
          <div className="cal-types" role="radiogroup" aria-label="Loại sự kiện">
            {options.categories.map((c) => (
              <label key={c.categoryId} className={String(c.categoryId) === form.categoryId ? 'is-on' : undefined}>
                <input type="radio" name="category" value={c.categoryId} checked={String(c.categoryId) === form.categoryId}
                  onChange={() => set({ categoryId: String(c.categoryId) })} />
                <Icon name={styleOf(c.code).icon} size="sm" />{c.name}
              </label>
            ))}
          </div>
        </div>

        <div className="cal-field">
          <label htmlFor="ev-title">Tiêu đề sự kiện <span className="cal-req">*</span>
            <span className="cal-hint cal-mono">{form.title.length} / {TITLE_MAX}</span></label>
          <input id="ev-title" className="cal-input" value={form.title} maxLength={TITLE_MAX} placeholder="Ví dụ: Kiểm tra 15 phút Đại số chương II"
            onChange={(e) => set({ title: e.target.value })} />
          {fieldError('MSG_EVENT_TITLE') && <p className="field-error">{fieldError('MSG_EVENT_TITLE')}</p>}
        </div>

        <div className="cal-timebox">
          <div className="cal-form-row is-three">
            <div className="cal-field">
              <label htmlFor="ev-date">Ngày diễn ra <span className="cal-req">*</span></label>
              <input id="ev-date" type="date" className="cal-input" value={form.date} min={now.slice(0, 10)} max={cls?.yearEnd} onChange={(e) => set({ date: e.target.value })} />
            </div>
            <div className="cal-field">
              <label htmlFor="ev-start">Giờ bắt đầu <span className="cal-req">*</span></label>
              <input id="ev-start" type="time" className="cal-input" value={form.start} onChange={(e) => set({ start: e.target.value })} />
            </div>
            <div className="cal-field">
              <label htmlFor="ev-end">Giờ kết thúc</label>
              <input id="ev-end" type="time" className="cal-input" value={form.end} onChange={(e) => set({ end: e.target.value })} />
            </div>
          </div>
          <div className="cal-timebox-foot">
            {lesson ? (
              <span className="cal-match"><Icon name="check_circle" size="sm" />Khớp lịch học: Tiết {lesson.period} ({lesson.start} – {lesson.end}) · {lesson.subjectName}{lesson.room ? ` · ${lesson.room}` : ''}</span>
            ) : form.start && isoDate(form.date) ? <span className="cal-muted cal-small">Không trùng tiết học nào của lớp vào giờ này.</span> : null}
            {problems.time && (form.start || form.end) && <span className="field-error">{problems.time}</span>}
            {fieldError('MSG_EVENT_TIME') && <span className="field-error">{fieldError('MSG_EVENT_TIME')}</span>}
          </div>
        </div>

        <div className="cal-field">
          <label htmlFor="ev-desc">Mô tả chi tiết &amp; dặn dò
            <span className="cal-hint cal-mono">{form.description.length} / {DESCRIPTION_MAX}</span></label>
          <div className="cal-notebook-input">
            <textarea id="ev-desc" rows={4} value={form.description} maxLength={DESCRIPTION_MAX}
              placeholder="Nội dung, địa điểm, đồ dùng cần chuẩn bị…" onChange={(e) => set({ description: e.target.value })} />
          </div>
        </div>

        <div className="cal-field cal-audience-field">
          <span className="cal-label">Ai được xem <span className="cal-hint">GVCN và bạn luôn thấy sự kiện</span></span>
          <div className="cal-checks">
            <label><input type="checkbox" checked={form.forStudents} onChange={(e) => set({ forStudents: e.target.checked })} />Học sinh lớp {cls?.className ?? ''}</label>
            <label><input type="checkbox" checked={form.forParents} onChange={(e) => set({ forParents: e.target.checked })} />Phụ huynh học sinh</label>
            <label><input type="checkbox" checked={form.forSubjectTeachers} onChange={(e) => set({ forSubjectTeachers: e.target.checked })} />Giáo viên dạy lớp</label>
          </div>
          <div className="cal-pick-row">
            <button type="button" className="btn btn-secondary" onClick={() => setPicking((v) => !v)} disabled={!form.classId}>
              <Icon name="person_add" size="sm" /> Chọn từng người{form.viewerIds.size ? ` (${form.viewerIds.size})` : ''}
            </button>
            {form.viewerIds.size > 0 && <button type="button" className="cal-link" onClick={() => set({ viewerIds: new Set() })}>Bỏ chọn tất cả</button>}
            {noAudience && <span className="cal-warn"><Icon name="visibility_off" size="sm" />Chưa chọn ai: chỉ bạn và giáo viên chủ nhiệm thấy sự kiện.</span>}
          </div>
          {picking && form.classId && (
            <PeoplePicker classId={form.classId} selected={form.viewerIds} onChange={(s) => set({ viewerIds: s })} onClose={() => setPicking(false)} />
          )}
          {fieldError('MSG_EVENT_VIEWERS') && <p className="field-error">{fieldError('MSG_EVENT_VIEWERS')}</p>}
        </div>

        <div className="cal-callout">
          <Icon name="notifications_active" />
          <div>
            <strong>Thông báo tự động</strong>
            <p>Người được xem nhận thông báo khi sự kiện được tạo, và một lần nhắc trước giờ bắt đầu 1 ngày (sự kiện tạo hoặc dời sát giờ hơn 1 ngày thì không nhắc). Đổi giờ thì nhắc lại theo giờ mới.</p>
          </div>
        </div>

        {saveError && !['MSG_EVENT_TITLE', 'MSG_EVENT_TIME', 'MSG_EVENT_VIEWERS', 'MSG_EVENT_SUBJECT_NOT_TAUGHT'].includes(saveError.code) && (
          <div className="notice amber" role="alert"><Icon name="error_outline" /><p>{errorText(saveError)}</p></div>
        )}

        <div className={`cal-form-actions${editing ? ' is-sticky' : ''}`}>
          <span />
          <div>
            <Link to={back} className="btn btn-secondary">Huỷ</Link>
            <button type="submit" className="btn btn-primary" disabled={invalid || saving || (editing && !dirty)}
              title={invalid ? Object.values(problems).find(Boolean) : undefined}>
              <Icon name={editing ? 'save' : 'add_circle'} size="sm" /> {saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo sự kiện'}
            </button>
          </div>
        </div>
      </form>

    </div>
  );
}
