import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { getStudentParents, linkParent, listStudents, unlinkParent } from '../../api/students.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText, RELATIONSHIP_LABELS } from '../../messages.js';
import { formatDate } from '../../utils/format.js';
import './UpdateStudentRelationshipPage.css';

const MAX_PARENTS = 2; // business-rules §3
const RELATIONSHIP_TYPES = ['FATHER', 'MOTHER', 'GUARDIAN']; // sent exactly like this (the server is case sensitive)
const MIN_QUERY_LENGTH = 2;
const SEARCH_DELAY_MS = 300;
const SEARCH_PAGE_SIZE = 8;
const LOAD_ERROR = 'Không tải được thông tin phụ huynh. Vui lòng thử lại.';
const LINK_ERROR = 'Không liên kết được phụ huynh. Vui lòng thử lại.';
const UNLINK_ERROR = 'Không gỡ được liên kết. Vui lòng thử lại.';
const FULL_NOTE = 'Đã đủ 2 phụ huynh. Gỡ liên kết trước khi thêm.';

// TODO messages.js: these codes are waiting for the team lead's approval (with the other FE-02 codes). Until then
// the Vietnamese text lives here; errorText() wins as soon as messages.js has the code.
const ACTION_ERRORS = {
  MSG_PARENT_NOT_FOUND: 'Không tìm thấy phụ huynh.',
  MSG_USER_NOT_PARENT: 'Tài khoản này không phải tài khoản phụ huynh.',
  MSG_LINK_ALREADY_EXISTS: 'Phụ huynh này đã được liên kết với học sinh.',
  MSG_MAX_PARENTS_REACHED: 'Học sinh đã có đủ 2 phụ huynh. Vui lòng gỡ liên kết trước khi thêm.',
  MSG_LINK_NOT_FOUND: 'Liên kết này không tồn tại.',
  MSG_INVALID_RELATIONSHIP_TYPE: 'Quan hệ không hợp lệ.',
  MSG_STUDENT_NOT_FOUND: 'Không tìm thấy học sinh.',
  MSG_INVALID_PARAM: 'Giá trị không hợp lệ.',
};
// Errors about the chosen parent are shown under the parent field; the relationship one under its select.
const PARENT_ERRORS = ['MSG_PARENT_NOT_FOUND', 'MSG_USER_NOT_PARENT', 'MSG_LINK_ALREADY_EXISTS'];

// TODO messages.js: WARN_* codes are waiting for approval too. warnings[].message is English (CLAUDE.md), so it is
// never shown; an unknown code gets a general sentence and a console warning.
const WARNING_TEXTS = {
  WARN_STUDENT_HAS_NO_CLASS: 'Học sinh chưa thuộc lớp nào nên chưa thay đổi nhóm lớp.',
  WARN_CLASS_HAS_NO_GROUPS: 'Lớp chưa có nhóm lớp, phụ huynh chưa được thêm vào nhóm nào.',
  WARN_CLASS_GROUPS_MISSING: 'Lớp còn thiếu một số nhóm lớp, phụ huynh chưa được thêm vào các nhóm đó.',
};
const WARNING_FALLBACK = 'Thao tác đã hoàn tất nhưng còn một việc chưa thực hiện được. Vui lòng kiểm tra lại nhóm lớp.';

const relationshipLabel = (type) => RELATIONSHIP_LABELS[type] ?? type;

function actionErrorText(err, fallback) {
  const general = errorText({ code: 'SERVER_ERROR' });
  const known = errorText({ code: err.code, details: err.details });
  if (known !== general || err.code === 'SERVER_ERROR') return known;
  if (ACTION_ERRORS[err.code]) return ACTION_ERRORS[err.code];
  console.warn(`[UpdateStudentRelationship] No Vietnamese message for error code ${err.code}:`, err.message);
  return fallback;
}

function warningText({ code, details, message }) {
  const known = errorText({ code, details });
  if (known !== errorText({ code: 'SERVER_ERROR' }) && known !== message) return known;
  if (WARNING_TEXTS[code]) return WARNING_TEXTS[code];
  console.warn(`[UpdateStudentRelationship] No Vietnamese message for warning code ${code}:`, message);
  return WARNING_FALLBACK;
}

function Breadcrumb({ backTo, detailPath, parentsPath, crumbState, studentCode }) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <span>EduConnect</span>/<span>Hồ sơ</span>/<Link to={backTo}>Học sinh</Link>
      {studentCode && (
        <>
          /
          <Link to={detailPath} state={crumbState} className="mono">
            {studentCode}
          </Link>
          /
          <Link to={parentsPath} state={crumbState}>
            Phụ huynh liên kết
          </Link>
        </>
      )}
      /<span className="current">Cập nhật</span>
    </nav>
  );
}

function NotFound({ backTo }) {
  return (
    <div className="update-relationship">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Hồ sơ</span>/<Link to={backTo}>Học sinh</Link>
      </nav>
      <section className="card card-outline update-relationship-missing">
        <Icon name="person_search" />
        <h1 className="title-md">Không tìm thấy học sinh</h1>
        <p className="muted">Học sinh này không tồn tại hoặc đường dẫn không đúng.</p>
        <Link to={backTo} className="btn btn-primary">
          <Icon name="arrow_back" size="sm" />
          Quay lại danh sách
        </Link>
      </section>
    </div>
  );
}

// Confirmation dialog shared by link and unlink, built like the UC-10 one: native <dialog>, Escape closes it unless
// a request is running, and the safe button gets the focus so confirming is always a deliberate click.
function ConfirmDialog({ open, title, icon, tone, busy, confirmLabel, busyLabel, confirmIcon, onCancel, onConfirm, children }) {
  const ref = useRef(null);
  const titleId = useId();
  const descId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`update-relationship-dialog ${tone}`}
      aria-labelledby={titleId}
      aria-describedby={descId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      {open && (
        <>
          <div className="update-relationship-dialog-head">
            <span className="update-relationship-dialog-icon">
              <Icon name={icon} />
            </span>
            <h2 id={titleId} className="title-sm">
              {title}
            </h2>
          </div>
          <div id={descId} className="update-relationship-dialog-body">
            {children}
          </div>
          <div className="update-relationship-dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy} autoFocus>
              Quay lại
            </button>
            <button type="button" className={`btn ${tone === 'danger' ? 'update-relationship-btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
              <Icon name={busy ? 'progress_activity' : confirmIcon} size="sm" className={busy ? 'update-relationship-spin' : undefined} />
              {busy ? busyLabel : confirmLabel}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}

// Linked parents vs the maximum (business-rules §3), as the quota ring of the design.
function QuotaMeter({ count }) {
  const full = count >= MAX_PARENTS;
  return (
    <div className={`update-relationship-quota${full ? ' full' : ''}`}>
      <span className="update-relationship-ring" style={{ '--quota': `${(count / MAX_PARENTS) * 100}%` }} aria-hidden="true">
        <span className="mono">
          {count}/{MAX_PARENTS}
        </span>
      </span>
      <div>
        <span className={`pill${full ? ' amber' : count > 0 ? ' green' : ''}`}>
          Đã liên kết {count} / {MAX_PARENTS} phụ huynh
        </span>
        <p className="caption muted">{full ? 'Đã đạt số phụ huynh tối đa.' : `Có thể liên kết thêm ${MAX_PARENTS - count} phụ huynh.`}</p>
      </div>
    </div>
  );
}

function LinkedParent({ parent, disabled, onUnlink }) {
  const locked = parent.accountStatus === 'LOCKED';
  return (
    <article className="card card-outline update-relationship-parent">
      <div className="update-relationship-parent-head">
        <div className="update-relationship-person">
          <Avatar src={parent.avatarUrl} name={parent.fullName} size={44} />
          <div>
            <div className="update-relationship-person-name">
              <h3 className="title-sm">{parent.fullName}</h3>
              <span className="chip ink">{relationshipLabel(parent.relationshipType)}</span>
            </div>
            <p className="caption muted">
              {parent.linkedAt ? (
                <>
                  Liên kết từ <span className="mono">{formatDate(parent.linkedAt)}</span>
                </>
              ) : (
                'Đã liên kết'
              )}
              {parent.otherChildrenCount > 0 && ` · Còn ${parent.otherChildrenCount} con khác đang học tại trường`}
            </p>
          </div>
        </div>
        {/* Accounts are never deleted, only locked (business-rules §3): a locked parent stays linked. */}
        <span className={`pill${locked ? '' : ' green'}`}>{locked ? 'Đã khoá' : 'Tài khoản hoạt động'}</span>
      </div>
      <ul className="update-relationship-contact">
        <li>
          <Icon name="call" size="sm" />
          {parent.phone ? <span className="mono">{parent.phone}</span> : <span className="pill amber">Thiếu số điện thoại</span>}
        </li>
        <li>
          <Icon name="mail" size="sm" />
          <span className={parent.email ? undefined : 'empty'}>{parent.email || 'Chưa cập nhật'}</span>
        </li>
      </ul>
      <div className="update-relationship-parent-foot">
        <button type="button" className="btn btn-danger" onClick={() => onUnlink(parent)} disabled={disabled}>
          <Icon name="link_off" size="sm" />
          Gỡ liên kết
        </button>
      </div>
    </article>
  );
}

// Picking an EXISTING parent account. ASSUMPTION / TODO FE-14 (Khanh): there is no parent search endpoint yet
// (UC-105 View Parent List is not built, and server/src/routes.js has nothing else that lists parents). Until then
// two read-only ways, both through FE-02's own endpoints:
//  - "Qua anh chị em": search a student who studies at the school (GET /students?q=), then pick one of THEIR linked
//    parents (GET /students/:id/parents) – the usual case of a parent with several children (business-rules §3),
//    and the name and phone are shown before linking.
//  - "Mã phụ huynh": type the parent id given by whoever created the account. The name cannot be looked up before
//    linking, so the confirmation says so and the linked person is shown right after the link.
// Replace both with a search by name / phone on GET /parents once FE-14 has it.
function SiblingPicker({ studentId, linkedIds, disabled, selected, onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [sibling, setSibling] = useState(null);
  const [siblingParents, setSiblingParents] = useState(null);
  const [parentsError, setParentsError] = useState('');

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH || sibling) {
      setResults(null);
      setSearching(false);
      return undefined;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      listStudents({ q, page: 1, pageSize: SEARCH_PAGE_SIZE }, { signal: controller.signal })
        .then((data) => {
          setResults(data.items.filter((s) => String(s.studentId) !== String(studentId)));
          setSearchError('');
        })
        .catch(() => {
          if (!controller.signal.aborted) setSearchError('Không tìm được học sinh. Vui lòng thử lại.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, sibling, studentId]);

  useEffect(() => {
    if (!sibling) return undefined;
    const controller = new AbortController();
    setSiblingParents(null);
    setParentsError('');
    getStudentParents(sibling.studentId, { signal: controller.signal })
      .then((data) => setSiblingParents(data.parents))
      .catch(() => {
        if (!controller.signal.aborted) setParentsError('Không tải được phụ huynh của học sinh này. Vui lòng thử lại.');
      });
    return () => controller.abort();
  }, [sibling]);

  function clear() {
    setSibling(null);
    setSiblingParents(null);
    onSelect(null);
  }

  if (sibling) {
    return (
      <div className="update-relationship-sibling">
        <div className="update-relationship-sibling-head">
          <div>
            <p className="caption muted">Phụ huynh của học sinh</p>
            <p className="strong">
              {sibling.fullName} <span className="mono caption muted">{sibling.studentCode}</span>
              {sibling.className && <span className="caption muted"> · Lớp {sibling.className}</span>}
            </p>
          </div>
          <button type="button" className="btn btn-tertiary" onClick={clear} disabled={disabled}>
            Chọn học sinh khác
          </button>
        </div>
        {parentsError && <p className="field-error">{parentsError}</p>}
        {!siblingParents && !parentsError && <p className="caption muted">Đang tải phụ huynh…</p>}
        {siblingParents?.length === 0 && (
          <p className="caption muted">Học sinh này chưa có phụ huynh nào được liên kết.</p>
        )}
        {siblingParents?.length > 0 && (
          <ul className="update-relationship-options" role="list">
            {siblingParents.map((p) => {
              const already = linkedIds.has(p.parentId);
              const active = selected?.parentId === p.parentId;
              return (
                <li key={p.parentId}>
                  <button
                    type="button"
                    className={`update-relationship-option${active ? ' active' : ''}`}
                    onClick={() => onSelect({ ...p, known: true })}
                    disabled={disabled || already}
                    aria-pressed={active}
                  >
                    <Avatar src={p.avatarUrl} name={p.fullName} size={36} />
                    <span>
                      <span className="strong">{p.fullName}</span>
                      <span className="caption muted">
                        <span className="mono">{p.phone || 'Thiếu số điện thoại'}</span>
                        {' · '}
                        {already ? 'Đã liên kết với học sinh này' : `${relationshipLabel(p.relationshipType)} của ${sibling.fullName}`}
                      </span>
                    </span>
                    {active && <Icon name="check_circle" size="sm" filled />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="field">
      <label className="field-label" htmlFor="update-relationship-search">
        Tìm học sinh là anh, chị, em
      </label>
      <div className="input-wrap">
        <Icon name="search" size="sm" className="update-relationship-input-icon" />
        <input
          id="update-relationship-search"
          className="input update-relationship-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nhập họ tên hoặc mã học sinh"
          disabled={disabled}
          autoComplete="off"
          aria-describedby="update-relationship-search-help"
        />
      </div>
      <span id="update-relationship-search-help" className="field-help">
        Chọn một học sinh đang học tại trường, sau đó chọn phụ huynh đã liên kết với học sinh đó.
      </span>
      {searchError && <p className="field-error">{searchError}</p>}
      {searching && <p className="caption muted">Đang tìm…</p>}
      {!searching && results?.length === 0 && <p className="caption muted">Không có học sinh phù hợp.</p>}
      {!searching && results?.length > 0 && (
        <ul className="update-relationship-options" role="list">
          {results.map((s) => (
            <li key={`${s.studentId}-${s.classId ?? ''}`}>
              <button
                type="button"
                className="update-relationship-option"
                onClick={() => {
                  setSibling(s);
                  setQuery('');
                }}
                disabled={disabled || !s.parentCount}
              >
                <Avatar src={s.avatarUrl} name={s.fullName} size={36} />
                <span>
                  <span className="strong">{s.fullName}</span>
                  <span className="caption muted">
                    <span className="mono">{s.studentCode}</span>
                    {s.className && ` · Lớp ${s.className}`}
                    {' · '}
                    {s.parentCount ? `${s.parentCount} phụ huynh` : 'Chưa có phụ huynh'}
                  </span>
                </span>
                <Icon name="chevron_right" size="sm" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SelectedParent({ parent }) {
  if (parent.known) {
    return (
      <div className="update-relationship-selected">
        <Avatar src={parent.avatarUrl} name={parent.fullName} size={40} />
        <div>
          <p className="label-upper">Phụ huynh được chọn</p>
          <p className="strong">{parent.fullName}</p>
          <p className="caption muted">
            <span className="mono">{parent.phone || 'Thiếu số điện thoại'}</span>
            {parent.email && ` · ${parent.email}`}
          </p>
          {parent.accountStatus === 'LOCKED' && (
            <p className="caption update-relationship-locked">Tài khoản này đang bị khoá. Liên kết vẫn được lưu.</p>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="notice amber update-relationship-unverified">
      <Icon name="help" size="sm" />
      <p>
        Mã phụ huynh <span className="mono strong">{parent.parentId}</span>: hệ thống chưa tra được họ tên trước khi
        liên kết. Vui lòng kiểm tra kỹ mã với bộ phận cấp tài khoản.
      </p>
    </div>
  );
}

// SCR-13 Update Student Relationship (UC-13 Link / Unlink Parent–Student), School Manager only.
// Design: Stitch "SCR-12 Update Student Relationship" (the Stitch numbers are one behind docs/screens.md): a page of
// its own with the linked parents on the left and the "new link" panel on the right. Left out of the design on
// purpose: the unlink reason (student_parents has no column for it), the permission checkboxes and the extra
// relationship types (the schema has only FATHER / MOTHER / GUARDIAN), search by name / phone / ID card (no parent
// search endpoint yet, see SiblingPicker).
// Both actions answer with the whole UC-12 data, which replaces the page state: no extra GET after a success.
export default function UpdateStudentRelationshipPage() {
  const { studentId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const listSearch = location.state?.listSearch ?? '';
  // fromParents: SCR-12 is the history entry behind this one, so leaving goes back to it.
  const fromParents = Boolean(location.state?.fromParents);
  const backTo = `/students${listSearch}`;
  const detailPath = `/students/${studentId}`;
  const parentsPath = `/students/${studentId}/parents`;
  const crumbState = { listSearch: location.state?.listSearch };
  const validId = /^[1-9]\d*$/.test(studentId ?? '');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(validId);
  const [loadError, setLoadError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const [mode, setMode] = useState('sibling'); // 'sibling' | 'code'
  const [selected, setSelected] = useState(null); // { parentId, known, fullName?, phone?, ... }
  const [codeInput, setCodeInput] = useState('');
  const [relationship, setRelationship] = useState('');
  const [parentError, setParentError] = useState('');
  const [relationshipError, setRelationshipError] = useState('');
  const [formError, setFormError] = useState('');
  const [listError, setListError] = useState('');
  const [pickerKey, setPickerKey] = useState(0); // remounts the picker to clear it after a link

  const [confirmLink, setConfirmLink] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false); // a second click before React re-renders must not send a second request
  const [outcome, setOutcome] = useState(null); // { kind: 'link' | 'unlink', parent, warnings }
  const askedUnlink = useRef(false);

  // Loads (and after a stale-state error reloads) the UC-12 data; the page stays visible during a reload.
  useEffect(() => {
    if (!validId) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    getStudentParents(studentId, { signal: controller.signal })
      .then((res) => setData(res))
      .catch((err) => {
        if (!controller.signal.aborted) setLoadError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [studentId, validId, attempt]);

  // "Gỡ liên kết" on SCR-12 opens this page with the parent to unlink: ask for the confirmation once, here.
  useEffect(() => {
    const wanted = location.state?.unlinkParentId;
    if (!data || !wanted || askedUnlink.current) return;
    askedUnlink.current = true;
    const parent = data.parents.find((p) => p.parentId === wanted);
    if (parent) setUnlinkTarget(parent);
  }, [data, location.state]);

  function leave() {
    if (fromParents) navigate(-1);
    else navigate(parentsPath, { state: crumbState });
  }

  if (!validId) return <NotFound backTo={backTo} />;
  if (loadError && (loadError.status === 404 || loadError.code === 'MSG_STUDENT_NOT_FOUND' || loadError.code === 'MSG_INVALID_PARAM')) {
    return <NotFound backTo={backTo} />;
  }
  const crumbs = { backTo, detailPath, parentsPath, crumbState };
  if (loadError && !data) {
    return (
      <div className="update-relationship">
        <Breadcrumb {...crumbs} />
        <div className="form-error" role="alert">
          <Icon name="error" size="sm" />
          <p>{actionErrorText(loadError, LOAD_ERROR)}</p>
        </div>
        <div className="actions-row update-relationship-retry">
          <button type="button" className="btn btn-secondary" onClick={() => setAttempt((n) => n + 1)}>
            <Icon name="refresh" size="sm" />
            Thử lại
          </button>
          <button type="button" className="btn btn-tertiary" onClick={leave}>
            Quay lại thông tin phụ huynh
          </button>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="update-relationship" aria-busy="true">
        <Breadcrumb {...crumbs} />
        <div className="page-header">
          <div>
            <h1 className="headline-xl">Cập nhật liên kết phụ huynh</h1>
            <p>Đang tải thông tin phụ huynh…</p>
          </div>
        </div>
      </div>
    );
  }

  const { student, parents, canLinkMore } = data;
  const linkedIds = new Set(parents.map((p) => p.parentId));
  const locked = !canLinkMore || busy;

  function resetForm() {
    setSelected(null);
    setCodeInput('');
    setRelationship('');
    setParentError('');
    setRelationshipError('');
    setFormError('');
    setPickerKey((n) => n + 1);
  }

  function chooseMode(next) {
    if (next === mode) return;
    setMode(next);
    setSelected(null);
    setCodeInput('');
    setParentError('');
    setFormError('');
  }

  function chooseParent(parent) {
    setSelected(parent);
    setParentError('');
    setFormError('');
  }

  function changeCode(value) {
    setCodeInput(value);
    setParentError('');
    setFormError('');
    const trimmed = value.trim();
    setSelected(/^[1-9]\d{0,15}$/.test(trimmed) && Number.isSafeInteger(Number(trimmed)) ? { parentId: Number(trimmed), known: false } : null);
  }

  function askLink(e) {
    e.preventDefault();
    if (!canLinkMore) return;
    let ok = true;
    if (!selected) {
      setParentError(mode === 'code' && codeInput.trim() ? 'Mã phụ huynh phải là số nguyên dương.' : 'Vui lòng chọn phụ huynh.');
      ok = false;
    } else if (linkedIds.has(selected.parentId)) {
      setParentError(ACTION_ERRORS.MSG_LINK_ALREADY_EXISTS);
      ok = false;
    }
    if (!RELATIONSHIP_TYPES.includes(relationship)) {
      setRelationshipError('Vui lòng chọn quan hệ với học sinh.');
      ok = false;
    }
    if (ok) setConfirmLink(true);
  }

  async function run(request, fallback, onSuccess, onError) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const res = await request();
      const { warnings = [], ...next } = res;
      setData(next);
      setListError('');
      onSuccess(next, warnings);
    } catch (err) {
      if (err.status === 404 || err.code === 'MSG_STUDENT_NOT_FOUND') setLoadError(err);
      else onError(err, actionErrorText(err, fallback));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function doLink() {
    const { parentId } = selected;
    run(
      () => linkParent(student.studentId, { parentId, relationshipType: relationship }),
      LINK_ERROR,
      (next, warnings) => {
        setConfirmLink(false);
        const parent = next.parents.find((p) => p.parentId === parentId);
        setOutcome({ kind: 'link', parent, warnings });
        resetForm();
        toast(`Đã liên kết phụ huynh ${parent?.fullName ?? ''} với học sinh ${next.student.fullName}.`);
      },
      (err, text) => {
        setConfirmLink(false);
        if (PARENT_ERRORS.includes(err.code) || (err.code === 'MSG_INVALID_PARAM' && err.details?.field === 'parentId')) {
          setParentError(text);
        } else if (err.code === 'MSG_INVALID_RELATIONSHIP_TYPE') {
          setRelationshipError(text);
        } else {
          setFormError(text);
        }
        // The list on screen is out of date (another School Manager linked meanwhile): reload it.
        if (err.code === 'MSG_MAX_PARENTS_REACHED' || err.code === 'MSG_LINK_ALREADY_EXISTS') setAttempt((n) => n + 1);
      },
    );
  }

  function doUnlink() {
    const parent = unlinkTarget;
    run(
      () => unlinkParent(student.studentId, parent.parentId),
      UNLINK_ERROR,
      (next, warnings) => {
        setUnlinkTarget(null);
        setOutcome({ kind: 'unlink', parent, warnings });
        toast(`Đã gỡ liên kết phụ huynh ${parent.fullName}.`);
      },
      (err, text) => {
        setUnlinkTarget(null);
        setListError(text);
        if (err.code === 'MSG_LINK_NOT_FOUND') setAttempt((n) => n + 1); // already removed elsewhere: refresh
      },
    );
  }

  return (
    <div className="update-relationship">
      <Breadcrumb {...crumbs} studentCode={student.studentCode} />
      <div className="page-header">
        <div>
          <p className="label-upper update-relationship-eyebrow">
            Hồ sơ học sinh <span aria-hidden="true">·</span> <span className="mono">Mã học sinh {student.studentCode}</span>
          </p>
          <h1 className="headline-xl">Cập nhật liên kết phụ huynh</h1>
          <p>Liên kết hoặc gỡ liên kết tài khoản phụ huynh đã có với học sinh.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={leave}>
          <Icon name="arrow_back" size="sm" />
          Quay lại thông tin phụ huynh
        </button>
      </div>

      <section className="card card-outline update-relationship-summary" aria-label="Học sinh và định mức liên kết">
        <div className="update-relationship-student">
          <Avatar src={student.avatarUrl} name={student.fullName} size={56} />
          <div>
            <div className="update-relationship-person-name">
              <h2 className="title-md">{student.fullName}</h2>
              {student.className ? <span className="chip ink">Lớp {student.className}</span> : <span className="chip">Chưa xếp lớp</span>}
            </div>
            <p className="caption muted">
              Mã học sinh: <span className="mono strong">{student.studentCode}</span>
            </p>
          </div>
        </div>
        <QuotaMeter count={parents.length} />
      </section>

      {outcome && (
        <div className="update-relationship-outcome" aria-live="polite">
          <div className="notice ink">
            <Icon name={outcome.kind === 'link' ? 'link' : 'link_off'} size="sm" />
            <div>
              <p className="notice-title">
                {outcome.kind === 'link' ? 'Đã liên kết phụ huynh' : 'Đã gỡ liên kết phụ huynh'}
                {outcome.parent && (
                  <>
                    {' '}
                    {outcome.parent.fullName}
                    {outcome.parent.phone && (
                      <>
                        {' · '}
                        <span className="mono">{outcome.parent.phone}</span>
                      </>
                    )}
                  </>
                )}
              </p>
              <p>
                {outcome.kind === 'link'
                  ? 'Vui lòng kiểm tra đúng người. Nếu liên kết nhầm, hãy gỡ liên kết ngay.'
                  : 'Có thể liên kết lại phụ huynh này khi cần.'}
              </p>
            </div>
          </div>
          {outcome.warnings.map((w) => (
            <div key={w.code} className="notice amber" role="status">
              <Icon name="warning" size="sm" />
              <div>
                <p className="notice-title">Thao tác đã hoàn tất, còn một việc cần lưu ý</p>
                <p>{warningText(w)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="update-relationship-grid">
        <section className="update-relationship-current" aria-labelledby="update-relationship-current-title">
          <div className="update-relationship-section-head">
            <h2 id="update-relationship-current-title" className="title-sm">
              <Icon name="how_to_reg" size="sm" />
              Phụ huynh đang liên kết
            </h2>
            {loading && <span className="caption muted">Đang cập nhật…</span>}
          </div>
          {listError && (
            <div className="form-error" role="alert">
              <Icon name="error" size="sm" />
              <p>{listError}</p>
            </div>
          )}
          {parents.length === 0 ? (
            <div className="notice update-relationship-empty">
              <Icon name="family_restroom" />
              <div>
                <p className="notice-title">Chưa có phụ huynh nào được liên kết</p>
                <p>Dùng phần Liên kết phụ huynh để thêm phụ huynh hoặc người giám hộ cho học sinh này.</p>
              </div>
            </div>
          ) : (
            parents.map((p) => <LinkedParent key={p.parentId} parent={p} disabled={busy} onUnlink={setUnlinkTarget} />)
          )}
          <section className="card card-outline update-relationship-rules" aria-labelledby="update-relationship-rules-title">
            <Icon name="gavel" />
            <div>
              <h2 id="update-relationship-rules-title" className="title-sm">
                Quy định liên kết phụ huynh
              </h2>
              <ul>
                <li>Mỗi học sinh được liên kết tối đa 2 phụ huynh hoặc người giám hộ.</li>
                <li>Phụ huynh được liên kết xem được thông tin, điểm và điểm danh của học sinh, và tham gia nhóm lớp.</li>
                <li>Gỡ liên kết xoá hẳn liên kết; tài khoản phụ huynh vẫn được giữ nguyên.</li>
              </ul>
            </div>
          </section>
        </section>

        <section className="card card-outline update-relationship-panel" aria-labelledby="update-relationship-panel-title">
          <div className="update-relationship-section-head">
            <h2 id="update-relationship-panel-title" className="title-sm">
              <Icon name="person_add" size="sm" />
              Liên kết phụ huynh
            </h2>
            {!canLinkMore && <span className="stamp">Đủ liên kết</span>}
          </div>

          {!canLinkMore && (
            <div className="notice amber" id="update-relationship-full">
              <Icon name="lock" size="sm" />
              <p>{FULL_NOTE}</p>
            </div>
          )}

          <p className="caption update-relationship-account-note">
            <Icon name="info" size="sm" />
            <span>
              Chỉ liên kết được tài khoản phụ huynh đã có trên hệ thống. Nếu phụ huynh chưa có tài khoản, vui lòng liên hệ
              quản trị hệ thống để tạo trước, sau đó quay lại liên kết.
            </span>
          </p>

          <form onSubmit={askLink} noValidate>
            <fieldset className="update-relationship-fieldset" disabled={locked}>
              <legend className="field-label">Chọn phụ huynh</legend>
              <div className="update-relationship-modes" role="group" aria-label="Cách chọn phụ huynh">
                <button type="button" className={mode === 'sibling' ? 'active' : undefined} aria-pressed={mode === 'sibling'} onClick={() => chooseMode('sibling')}>
                  Qua anh, chị, em
                </button>
                <button type="button" className={mode === 'code' ? 'active' : undefined} aria-pressed={mode === 'code'} onClick={() => chooseMode('code')}>
                  Nhập mã phụ huynh
                </button>
              </div>

              <div className={parentError ? 'field invalid' : 'field'}>
                {mode === 'sibling' ? (
                  <SiblingPicker
                    key={pickerKey}
                    studentId={student.studentId}
                    linkedIds={linkedIds}
                    disabled={locked}
                    selected={selected}
                    onSelect={chooseParent}
                  />
                ) : (
                  <>
                    <label className="field-label" htmlFor="update-relationship-code">
                      Mã phụ huynh
                    </label>
                    <div className="input-wrap">
                      <input
                        id="update-relationship-code"
                        className="input mono"
                        inputMode="numeric"
                        autoComplete="off"
                        value={codeInput}
                        onChange={(e) => changeCode(e.target.value)}
                        placeholder="Ví dụ: 125"
                        aria-invalid={Boolean(parentError)}
                        aria-describedby="update-relationship-code-help"
                      />
                    </div>
                    <span id="update-relationship-code-help" className="field-help">
                      Mã số tài khoản phụ huynh do bộ phận quản trị hệ thống cung cấp.
                    </span>
                  </>
                )}
                {parentError && (
                  <span className="field-error" role="alert">
                    {parentError}
                  </span>
                )}
              </div>

              {selected && <SelectedParent parent={selected} />}

              <div className={relationshipError ? 'field invalid' : 'field'}>
                <label className="field-label" htmlFor="update-relationship-type">
                  Quan hệ với học sinh
                </label>
                <div className="input-wrap">
                  <select
                    id="update-relationship-type"
                    className="input update-relationship-select"
                    value={relationship}
                    onChange={(e) => {
                      setRelationship(e.target.value);
                      setRelationshipError('');
                    }}
                    aria-invalid={Boolean(relationshipError)}
                  >
                    <option value="">Chọn quan hệ</option>
                    {RELATIONSHIP_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {relationshipLabel(t)}
                      </option>
                    ))}
                  </select>
                  <Icon name="unfold_more" size="sm" className="update-relationship-select-icon" />
                </div>
                {relationshipError && (
                  <span className="field-error" role="alert">
                    {relationshipError}
                  </span>
                )}
              </div>

              {formError && (
                <div className="form-error" role="alert">
                  <Icon name="error" size="sm" />
                  <p>{formError}</p>
                </div>
              )}

              <button type="submit" className="btn btn-primary update-relationship-submit" aria-describedby={canLinkMore ? undefined : 'update-relationship-full'}>
                <Icon name="add_link" size="sm" />
                Liên kết phụ huynh
              </button>
            </fieldset>
          </form>
        </section>
      </div>

      <ConfirmDialog
        open={confirmLink}
        title="Xác nhận liên kết phụ huynh"
        icon="add_link"
        tone="ink"
        busy={busy}
        confirmLabel="Xác nhận liên kết"
        busyLabel="Đang liên kết…"
        confirmIcon="link"
        onCancel={() => setConfirmLink(false)}
        onConfirm={doLink}
      >
        {selected && (
          <>
            <dl className="update-relationship-dialog-facts">
              <dt>Phụ huynh</dt>
              <dd>
                {selected.known ? (
                  <>
                    <span className="strong">{selected.fullName}</span>
                    {selected.phone && (
                      <>
                        {' · '}
                        <span className="mono">{selected.phone}</span>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    Mã phụ huynh <span className="mono strong">{selected.parentId}</span> (chưa tra được họ tên)
                  </>
                )}
              </dd>
              <dt>Quan hệ</dt>
              <dd className="strong">{relationshipLabel(relationship)}</dd>
              <dt>Học sinh</dt>
              <dd>
                <span className="strong">{student.fullName}</span> (<span className="mono">{student.studentCode}</span>)
              </dd>
            </dl>
            <div className="notice amber">
              <Icon name="warning" size="sm" />
              <p>
                Sau khi liên kết, tài khoản này xem được thông tin, điểm và điểm danh của học sinh, và được thêm vào nhóm
                chung, nhóm phụ huynh của lớp. Vui lòng chắc chắn đây đúng là phụ huynh của học sinh.
              </p>
            </div>
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(unlinkTarget)}
        title="Xác nhận gỡ liên kết phụ huynh"
        icon="link_off"
        tone="danger"
        busy={busy}
        confirmLabel="Gỡ liên kết"
        busyLabel="Đang gỡ liên kết…"
        confirmIcon="link_off"
        onCancel={() => setUnlinkTarget(null)}
        onConfirm={doUnlink}
      >
        {unlinkTarget && (
          <>
            <dl className="update-relationship-dialog-facts">
              <dt>Phụ huynh</dt>
              <dd>
                <span className="strong">{unlinkTarget.fullName}</span>
                {unlinkTarget.phone && (
                  <>
                    {' · '}
                    <span className="mono">{unlinkTarget.phone}</span>
                  </>
                )}
              </dd>
              <dt>Quan hệ</dt>
              <dd className="strong">{relationshipLabel(unlinkTarget.relationshipType)}</dd>
              <dt>Học sinh</dt>
              <dd>
                <span className="strong">{student.fullName}</span> (<span className="mono">{student.studentCode}</span>)
              </dd>
            </dl>
            <div className="notice update-relationship-consequences">
              <Icon name="warning" size="sm" />
              <div>
                <p className="notice-title">Sau khi gỡ liên kết</p>
                <ul>
                  <li>Phụ huynh không còn xem được thông tin, điểm và điểm danh của học sinh này.</li>
                  <li>
                    Phụ huynh rời nhóm chung và nhóm phụ huynh của lớp, trừ khi còn con khác đang học cùng lớp hoặc đang
                    dạy lớp này.
                  </li>
                  <li>Liên kết bị xoá hẳn. Tài khoản phụ huynh vẫn được giữ nguyên và có thể liên kết lại khi cần.</li>
                </ul>
              </div>
            </div>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
