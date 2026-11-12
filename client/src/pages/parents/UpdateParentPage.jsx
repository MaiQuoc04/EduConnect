import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { getParent, updateParent } from '../../api/parents.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { handOverParentDetail } from './parentHandoff.js';
import useLeaveGuard from './useLeaveGuard.js';
import './UpdateParentPage.css';

const MAX_FULL_NAME_LENGTH = 150; // users.full_name VARCHAR(150)
const MAX_OCCUPATION_LENGTH = 100; // parents.occupation VARCHAR(100), business-rules §3 (same limit as the server)
const MAX_ADDRESS_LENGTH = 500; // users.address, business-rules §3 (same limit as the server)
const REQUIRED = 'Trường này là bắt buộc.'; // MSG02
const LOAD_ERROR = 'Không tải được thông tin phụ huynh. Vui lòng thử lại.';
const SAVE_ERROR = 'Không lưu được thông tin phụ huynh. Vui lòng thử lại.';
const EMPTY_VALUE = 'Chưa cập nhật';
const SA_ONLY = 'Chỉ Quản trị hệ thống thay đổi được.';
// TODO (lead, Quoc): these two UC-09 / UC-106 codes are not in messages.js yet; UpdateStudentPage handles them on the
// page too. Move them to messages.js together and drop this table.
const PAGE_ERRORS = {
  MSG_NO_FIELDS_TO_UPDATE: 'Chưa có thông tin nào thay đổi.',
  MSG_FIELD_NOT_EDITABLE: 'Một số thông tin không thể sửa ở đây.',
};
// Shown when the server rejects a value with a code messages.js has no text for (same idea as UpdateStudentPage).
const SERVER_FIELD_ERRORS = {
  fullName: 'Họ và tên không hợp lệ.',
  occupation: 'Nghề nghiệp không hợp lệ.',
  address: 'Địa chỉ không hợp lệ.',
};
const FIELD_LABELS = { fullName: 'Họ và tên', occupation: 'Nghề nghiệp', address: 'Địa chỉ' };
const FIELD_ORDER = ['fullName', 'occupation', 'address'];

// Same normalisation as the server: NFC, trimmed, runs of spaces collapsed.
const normalizeText = (value) => value.normalize('NFC').trim().replace(/\s+/g, ' ');
// Occupation and address can be cleared (business-rules §3): empty means null.
const normalizeClearable = (value) => normalizeText(value) || null;
const length = (value) => [...value].length; // characters as PostgreSQL counts them (code points)

function validate(form) {
  const errors = {};
  const name = normalizeText(form.fullName);
  if (!name) errors.fullName = REQUIRED;
  else if (length(name) > MAX_FULL_NAME_LENGTH) errors.fullName = `Họ và tên tối đa ${MAX_FULL_NAME_LENGTH} ký tự.`;
  const occupation = normalizeClearable(form.occupation);
  if (occupation && length(occupation) > MAX_OCCUPATION_LENGTH) {
    errors.occupation = `Nghề nghiệp không được vượt quá ${MAX_OCCUPATION_LENGTH} ký tự.`;
  }
  const address = normalizeClearable(form.address);
  if (address && length(address) > MAX_ADDRESS_LENGTH) {
    errors.address = `Địa chỉ không được vượt quá ${MAX_ADDRESS_LENGTH} ký tự.`;
  }
  return errors;
}

// Only the fields whose value really differs from the loaded parent, and only fullName / occupation / address: the
// server rejects any other key (UC-106 never changes login identifiers, business-rules §3).
function changedFields(form, parent) {
  const changes = {};
  const name = normalizeText(form.fullName);
  if (name !== parent.fullName) changes.fullName = name;
  const occupation = normalizeClearable(form.occupation);
  if (occupation !== (parent.occupation ?? null)) changes.occupation = occupation;
  const address = normalizeClearable(form.address);
  if (address !== (parent.address ?? null)) changes.address = address;
  return changes;
}

const formFromParent = (parent) => ({
  fullName: parent.fullName ?? '',
  occupation: parent.occupation ?? '',
  address: parent.address ?? '',
});

function LeaveDialog({ open, onStay, onLeave }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="update-parent-dialog"
      aria-labelledby="update-parent-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onStay();
      }}
    >
      <div className="update-parent-dialog-body">
        <Icon name="edit_note" />
        <div>
          <h2 id="update-parent-dialog-title" className="title-sm">
            Bỏ các thay đổi chưa lưu?
          </h2>
          <p className="muted">Những thông tin bạn vừa sửa sẽ không được lưu nếu rời trang này.</p>
        </div>
      </div>
      <div className="update-parent-dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onStay} autoFocus>
          Tiếp tục chỉnh sửa
        </button>
        <button type="button" className="btn btn-primary" onClick={onLeave}>
          Bỏ thay đổi
        </button>
      </div>
    </dialog>
  );
}

function Breadcrumb({ backTo, detailPath, crumb, onDetailClick }) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <span>EduConnect</span>/<span>Hồ sơ</span>/<Link to={backTo}>Phụ huynh</Link>
      {crumb && (
        <>
          /
          <Link to={detailPath} className="mono" data-leave-guard="off" onClick={onDetailClick}>
            {crumb}
          </Link>
        </>
      )}
      /<span className="current">Chỉnh sửa thông tin</span>
    </nav>
  );
}

function Skeleton({ backTo, detailPath }) {
  return (
    <div className="update-parent" aria-busy="true">
      <Breadcrumb backTo={backTo} detailPath={detailPath} />
      <div className="page-header">
        <div>
          <h1 className="headline-xl">Chỉnh sửa thông tin phụ huynh</h1>
          <p>Đang tải thông tin phụ huynh…</p>
        </div>
      </div>
      <div className="card card-outline update-parent-skeleton" aria-hidden="true">
        <span className="block" />
        <span className="block" />
        <span className="block short" />
        <span className="block" />
      </div>
    </div>
  );
}

function NotFound({ backTo }) {
  return (
    <div className="update-parent">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Hồ sơ</span>/<Link to={backTo}>Phụ huynh</Link>
      </nav>
      <section className="card card-outline update-parent-missing">
        <Icon name="person_search" />
        <h1 className="title-md">Không tìm thấy phụ huynh</h1>
        <p className="muted">Phụ huynh này không tồn tại hoặc đường dẫn không đúng.</p>
        <Link to={backTo} className="btn btn-primary" data-leave-guard="off">
          <Icon name="arrow_back" size="sm" />
          Quay lại danh sách
        </Link>
      </section>
    </div>
  );
}

function ReadOnlyField({ label, value, help, mono }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="input-wrap">
        <input
          className={`input update-parent-locked${mono && value ? ' mono' : ''}`}
          value={value || EMPTY_VALUE}
          readOnly
          aria-readonly="true"
          aria-label={label}
        />
        <Icon name="lock" size="sm" className="update-parent-lock-icon" />
      </div>
      <span className="field-help">{help}</span>
    </div>
  );
}

function FieldMessage({ id, error, help }) {
  if (error) {
    return (
      <span id={id} className="field-error" role="alert">
        {error}
      </span>
    );
  }
  return (
    <span id={id} className="field-help">
      {help}
    </span>
  );
}

// SCR-16 Update Parent (UC-106 Update Parent Information), School Manager only. Edits full name, occupation and
// address – nothing else: username, email and phone belong to System Admin (UC-99, business-rules §3). Not the
// parent's own UC-108 (FE-01). No Stitch design exists for this screen; it follows Update Student (SCR-09).
export default function UpdateParentPage() {
  const { parentId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const listSearch = location.state?.listSearch ?? '';
  // fromDetail: the Parent Detail entry is right behind this one in the history, so leaving goes back to it
  // instead of stacking a second copy.
  const fromDetail = Boolean(location.state?.fromDetail);
  const backTo = `/parents${listSearch}`;
  const detailPath = `/parents/${parentId}`;
  // Same rule as Parent Detail: an id that is not a positive integer is "not found" without calling the API.
  const validId = /^[1-9]\d*$/.test(parentId ?? '');

  const handedOver = location.state?.detail?.parent?.parentId === Number(parentId) ? location.state.detail : null;
  const initialData = useRef(handedOver);
  const [data, setData] = useState(handedOver);
  const [form, setForm] = useState(() => (handedOver ? formFromParent(handedOver.parent) : null));
  const [loading, setLoading] = useState(validId && !handedOver);
  const [loadError, setLoadError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Keep only the flags in the history entry, so a reload of this page loads fresh data.
  useEffect(() => {
    if (location.state?.detail) {
      navigate(location.pathname, { replace: true, state: { fromDetail: location.state.fromDetail, listSearch } });
    }
  }, [location, navigate, listSearch]);

  // Opened directly (no data handed over by Parent Detail): load it.
  useEffect(() => {
    if (!validId) return undefined;
    if (attempt === 0 && initialData.current?.parent.parentId === Number(parentId)) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    getParent(parentId, { signal: controller.signal })
      .then((result) => {
        setData(result);
        setForm(formFromParent(result.parent));
      })
      .catch((err) => {
        if (!controller.signal.aborted) setLoadError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [parentId, validId, attempt]);

  const parent = data?.parent;
  const changes = form && parent ? changedFields(form, parent) : {};
  const changedCount = Object.keys(changes).length;
  const dirty = !loadError && changedCount > 0;
  const { asking, setAsking, stay, leave } = useLeaveGuard(dirty);

  // Back to Parent Detail with the given data, so it shows without a new request. Opened from Parent Detail: go back
  // to that history entry; opened directly: replace this entry with the detail page.
  const backToDetail = useCallback(
    (detail) => {
      handOverParentDetail(detail);
      if (fromDetail) leave(null, 1);
      else leave(() => navigate(detailPath, { replace: true, state: { listSearch } }));
    },
    [leave, navigate, detailPath, listSearch, fromDetail],
  );

  function cancel(e) {
    e?.preventDefault();
    if (dirty) setAsking({ cancel: true });
    else backToDetail(data);
  }

  function confirmLeave() {
    const target = asking;
    setAsking(null);
    if (target?.to) leave(() => navigate(target.to));
    else if (target?.back) leave(null, 1);
    else backToDetail(data);
  }

  if (!validId) return <NotFound backTo={backTo} />;
  if (loadError && (loadError.status === 404 || loadError.code === 'MSG_PARENT_NOT_FOUND' || loadError.code === 'MSG_INVALID_PARAM')) {
    return <NotFound backTo={backTo} />;
  }
  if (loadError) {
    const text = errorText({ code: loadError.code, details: loadError.details });
    if (!['NETWORK_ERROR', 'SERVER_ERROR'].includes(loadError.code)) {
      console.warn(`[UpdateParent] No Vietnamese message for error code ${loadError.code}:`, loadError.message);
    }
    return (
      <div className="update-parent">
        <Breadcrumb backTo={backTo} detailPath={detailPath} />
        <div className="form-error" role="alert">
          <Icon name="error" size="sm" />
          <p>{loadError.code === 'NETWORK_ERROR' ? text : LOAD_ERROR}</p>
        </div>
        <div className="actions-row update-parent-retry">
          <button type="button" className="btn btn-secondary" onClick={() => setAttempt((n) => n + 1)}>
            <Icon name="refresh" size="sm" />
            Thử lại
          </button>
          <Link to={backTo} className="btn btn-tertiary">
            Quay lại danh sách
          </Link>
        </div>
      </div>
    );
  }
  if (loading || !data || !form) return <Skeleton backTo={backTo} detailPath={detailPath} />;

  const errors = validate(form);
  const shown = (field) => serverErrors[field] ?? ((touched[field] || submitted) && errors[field]) ?? null;

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setTouched((t) => ({ ...t, [field]: true }));
    setServerErrors(({ [field]: _removed, ...rest }) => rest);
    setFormError('');
  }

  async function save(e) {
    e.preventDefault();
    if (saving) return;
    setSubmitted(true);
    setFormError('');
    const firstInvalid = FIELD_ORDER.find((f) => errors[f]);
    if (firstInvalid) {
      document.getElementById(`update-parent-${firstInvalid}`)?.focus();
      return;
    }
    if (!changedCount) return;
    setSaving(true);
    try {
      const updated = await updateParent(parent.parentId, changes);
      toast('Đã cập nhật thông tin phụ huynh.');
      // The PATCH answers with the same "parent" object as UC-105: used as it is, no new GET.
      backToDetail({ ...data, parent: updated });
    } catch (err) {
      setSaving(false);
      if (err.status === 404 || err.code === 'MSG_PARENT_NOT_FOUND') {
        setLoadError(err);
        return;
      }
      // The server decides; its answer is always shown, in Vietnamese.
      const fallback = errorText({ code: 'SERVER_ERROR' });
      const known = errorText({ code: err.code, details: err.details });
      const hasText = known !== fallback || err.code === 'SERVER_ERROR';
      if (err.code === 'MSG_FIELD_NOT_EDITABLE') {
        // Programming error: this form must only send fullName, occupation and address.
        const fields = err.details?.fields ?? [];
        console.warn('[UpdateParent] The server refused fields this form must never send:', fields);
        setFormError(`${PAGE_ERRORS.MSG_FIELD_NOT_EDITABLE} Trường bị từ chối: ${fields.join(', ')}. Vui lòng báo cho nhóm phát triển.`);
      } else if (err.code === 'MSG_NO_FIELDS_TO_UPDATE') {
        setFormError(PAGE_ERRORS.MSG_NO_FIELDS_TO_UPDATE);
      } else if (
        ['MSG_INVALID_PARAM', 'MSG_ADDRESS_TOO_LONG', 'MSG_OCCUPATION_TOO_LONG'].includes(err.code) &&
        SERVER_FIELD_ERRORS[err.details?.field]
      ) {
        const field = err.details.field;
        if (!hasText) console.warn(`[UpdateParent] No Vietnamese message for ${err.code} (${field}):`, err.message);
        setServerErrors({ [field]: hasText ? known : SERVER_FIELD_ERRORS[field] });
        document.getElementById(`update-parent-${field}`)?.focus();
      } else {
        if (!hasText) console.warn(`[UpdateParent] No Vietnamese message for error code ${err.code}:`, err.message);
        setFormError(hasText ? known : SAVE_ERROR);
      }
    }
  }

  const nameError = shown('fullName');
  const occupationError = shown('occupation');
  const addressError = shown('address');
  const crumb = parent.phone || parent.username;

  return (
    <div className="update-parent">
      <Breadcrumb backTo={backTo} detailPath={detailPath} crumb={crumb} onDetailClick={cancel} />
      <div className="page-header">
        <div>
          <h1 className="headline-xl">Chỉnh sửa thông tin phụ huynh</h1>
          <p>
            Cập nhật hồ sơ phụ huynh <span className="strong">{parent.fullName}</span>
            {parent.phone && (
              <>
                {' '}
                · SĐT: <span className="mono">{parent.phone}</span>
              </>
            )}
          </p>
        </div>
        <Link to={detailPath} className="btn btn-tertiary update-parent-back" data-leave-guard="off" onClick={cancel}>
          <Icon name="arrow_back" size="sm" />
          Hồ sơ chi tiết
        </Link>
      </div>

      <form className="card card-outline update-parent-sheet" onSubmit={save} noValidate>
        <section className="update-parent-section" aria-labelledby="update-parent-basic">
          <div className="update-parent-section-head">
            <h2 id="update-parent-basic" className="title-sm">
              1. Thông tin cơ bản
            </h2>
            <span className="caption muted">Mục đánh dấu (*) là bắt buộc</span>
          </div>
          <div className="update-parent-grid">
            <div className={`field${nameError ? ' invalid' : ''}`}>
              <label className="field-label" htmlFor="update-parent-fullName">
                <span>
                  Họ và tên <span className="update-parent-required">*</span>
                </span>
              </label>
              <div className="input-wrap">
                <input
                  id="update-parent-fullName"
                  className="input"
                  value={form.fullName}
                  onChange={(e) => setField('fullName', e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, fullName: true }))}
                  autoComplete="off"
                  disabled={saving}
                  aria-invalid={Boolean(nameError)}
                  aria-describedby="update-parent-fullName-msg"
                />
              </div>
              <FieldMessage
                id="update-parent-fullName-msg"
                error={nameError}
                help={`Họ và tên đầy đủ của phụ huynh, tối đa ${MAX_FULL_NAME_LENGTH} ký tự.`}
              />
            </div>

            <div className={`field${occupationError ? ' invalid' : ''}`}>
              <label className="field-label" htmlFor="update-parent-occupation">
                Nghề nghiệp
              </label>
              <div className="input-wrap">
                <input
                  id="update-parent-occupation"
                  className="input"
                  value={form.occupation}
                  onChange={(e) => setField('occupation', e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, occupation: true }))}
                  autoComplete="off"
                  disabled={saving}
                  aria-invalid={Boolean(occupationError)}
                  aria-describedby="update-parent-occupation-msg"
                />
              </div>
              <FieldMessage
                id="update-parent-occupation-msg"
                error={occupationError}
                help={`Tối đa ${MAX_OCCUPATION_LENGTH} ký tự. Để trống nếu muốn xoá nghề nghiệp.`}
              />
            </div>

            <div className={`field wide${addressError ? ' invalid' : ''}`}>
              <label className="field-label" htmlFor="update-parent-address">
                Địa chỉ
              </label>
              <div className="input-wrap">
                <textarea
                  id="update-parent-address"
                  className="input update-parent-textarea"
                  rows={3}
                  value={form.address}
                  onChange={(e) => setField('address', e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, address: true }))}
                  autoComplete="off"
                  disabled={saving}
                  aria-invalid={Boolean(addressError)}
                  aria-describedby="update-parent-address-msg"
                />
              </div>
              <FieldMessage
                id="update-parent-address-msg"
                error={addressError}
                help={`Nơi ở hiện tại, tối đa ${MAX_ADDRESS_LENGTH} ký tự. Để trống nếu muốn xoá địa chỉ.`}
              />
            </div>
          </div>
        </section>

        {/* Shown for reference only, never sent: the PATCH body holds fullName / occupation / address at most. */}
        <section className="update-parent-section is-readonly" aria-labelledby="update-parent-account">
          <div className="update-parent-section-head">
            <h2 id="update-parent-account" className="title-sm">
              2. Thông tin tài khoản hệ thống (chỉ đọc)
            </h2>
            <span className="caption muted update-parent-locked-note">
              <Icon name="lock" size="sm" />
              Không sửa ở màn này
            </span>
          </div>
          <div className="notice amber update-parent-notice">
            <Icon name="lock_person" />
            <div>
              <p className="notice-title">Chỉ Quản trị hệ thống mới thay đổi được tên đăng nhập, email và số điện thoại.</p>
              <p className="caption">
                Số điện thoại dùng để nhận diện phụ huynh có nhiều con. Nếu cần điều chỉnh, vui lòng liên hệ Quản trị hệ
                thống của trường.
              </p>
            </div>
          </div>
          <div className="update-parent-grid">
            <ReadOnlyField label="Tên đăng nhập" value={parent.username} mono help={SA_ONLY} />
            <ReadOnlyField label="Số điện thoại" value={parent.phone} mono help={SA_ONLY} />
            <ReadOnlyField label="Email" value={parent.email} help={SA_ONLY} />
          </div>
        </section>

        {formError && (
          <div className="form-error update-parent-form-error" role="alert">
            <Icon name="error" size="sm" />
            <p>{formError}</p>
          </div>
        )}

        <div className="update-parent-footer">
          <span className="update-parent-status caption">
            <Icon name="edit_note" size="sm" />
            {changedCount
              ? `${changedCount} trường đã thay đổi: ${Object.keys(changes).map((f) => FIELD_LABELS[f]).join(', ')}`
              : 'Chưa có thay đổi nào'}
          </span>
          <div className="update-parent-buttons">
            <button type="button" className="btn btn-secondary" onClick={cancel} disabled={saving}>
              Huỷ
            </button>
            {/* Disabled while nothing changed: the server answers an empty body with MSG_NO_FIELDS_TO_UPDATE. */}
            <button type="submit" className="btn btn-primary" disabled={!dirty || saving}>
              <Icon name={saving ? 'progress_activity' : 'check'} size="sm" className={saving ? 'update-parent-spin' : undefined} />
              {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
            </button>
          </div>
        </div>
      </form>

      <LeaveDialog open={Boolean(asking)} onStay={stay} onLeave={confirmLeave} />
    </div>
  );
}
