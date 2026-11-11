import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { getAttachmentLimits, getGradeLevelOptions } from '../../api/schoolPosts.js';
import { getClassOptions } from '../../api/students.js';
import Icon from '../../components/Icon.jsx';
import {
  AudienceLine,
  feedErrorText,
  narrowingRoles,
  POST_TYPE_LABELS,
  ROLE_LABELS,
  SHORT_SCOPE,
  TARGETABLE_ROLES,
} from './schoolFeedShared.jsx';
import './SchoolPostForm.css';

// FE-08 pieces shared by SCR-31 Create School Post (UC-60) and SCR-06 Update School Post (UC-61).
// Business rules §8: ANNOUNCEMENT needs an audience (grades and/or classes), can be liked / commented / pinned and
// sends a notification by default; NEWS is view only, whole school by default, not pinned, no notification by default.
// Design: Stitch "SCR-36 Create School Post" / "SCR-37 Update School Post" (old numbering): form card with the type
// switch, title counter, content, audience and notification switch, a live preview on the right, a footer bar.

export const MAX_TITLE_LENGTH = 255; // school_posts.title VARCHAR(255), counted in code points as the server does

// Same cleaning as the server (schoolposts.controller.js): NFC, trimmed, runs of white space collapsed in the title;
// the content keeps its line breaks, only the ends are trimmed.
export const normalizeTitle = (value) => value.normalize('NFC').trim().replace(/\s+/g, ' ');
export const normalizeContent = (value) => value.normalize('NFC').trim();
export const titleLength = (value) => [...normalizeTitle(value)].length;

export const POST_TYPE_INFO = {
  ANNOUNCEMENT: {
    icon: 'campaign',
    text:
      'Thông báo chính thức gửi tới khối hoặc lớp được chọn. Người nhận thích và bình luận được, nhận thông báo trong ' +
      'chuông; thông báo có thể được ghim lên đầu bảng tin.',
  },
  NEWS: {
    icon: 'newspaper',
    text:
      'Tin tức chỉ để đọc, mặc định dành cho toàn trường. Không có lượt thích, bình luận, không ghim được và mặc định ' +
      'không gửi thông báo.',
  },
};

// sendNotification default of each type (§8, schema comment of school_posts.send_notification).
export const DEFAULT_SEND_NOTIFICATION = { ANNOUNCEMENT: true, NEWS: false };

export const emptyAudience = () => ({ gradeLevelIds: [], classIds: [] });
export const isAudienceEmpty = (a) => a.gradeLevelIds.length === 0 && a.classIds.length === 0;
const sortedIds = (ids) => [...new Set(ids)].sort((x, y) => x - y);
export const sameAudience = (a, b) =>
  sortedIds(a.gradeLevelIds).join() === sortedIds(b.gradeLevelIds).join() &&
  sortedIds(a.classIds).join() === sortedIds(b.classIds).join();

// Roles (school_posts.target_roles): the form keeps the ticked roles, all three by default (= every role, the
// behaviour of every post of before). None ticked is every role too (said on screen). What is sent is the roles that
// narrow the audience: [] = every role (UC-60 / UC-61 store NULL).
export const allRoles = () => [...TARGETABLE_ROLES];
// UC-59 targetRoles ([] = every role) → the ticked boxes of SCR-06.
export const tickedRolesOf = (targetRoles) => (narrowingRoles(targetRoles).length ? narrowingRoles(targetRoles) : allRoles());
export const rolesToSend = (ticked) => narrowingRoles(ticked);
export const sameRoles = (a, b) => narrowingRoles(a).join() === narrowingRoles(b).join();

// --- Grades and classes ----------------------------------------------------------------------------------------

/**
 * Options of the audience picker, read only from FE-04 (Khanh):
 *   - grades: GET /classes/grade-levels (api/schoolPosts.js getGradeLevelOptions);
 *   - classes: GET /classes without schoolYearId = the classes of the CURRENT school year (FE-04 resolveYear, the same
 *     rule as the server's resolveSchoolYearId used by UC-60 / UC-61), through FE-02's getClassOptions.
 * The server only accepts classes of the current year (other years -> 400 MSG_CLASS_NOT_FOUND), so only these are
 * offered. Each class is put under its grade by gradeLevelName (getClassOptions does not return gradeLevelId).
 */
export function useAudienceOptions() {
  const [state, setState] = useState({ grades: [], classes: [], loading: true, error: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setState((s) => ({ ...s, loading: true, error: '' }));
    Promise.all([getGradeLevelOptions({ signal }), getClassOptions(undefined, { signal })])
      .then(([grades, classes]) => setState({ grades, classes, loading: false, error: '' }))
      .catch((err) => {
        if (signal.aborted) return;
        const error = feedErrorText(err, 'Không tải được danh sách khối và lớp. Vui lòng thử lại.');
        setState({ grades: [], classes: [], loading: false, error });
      });
    return () => controller.abort();
  }, [attempt]);
  return { ...state, reload: () => setAttempt((n) => n + 1) };
}

/**
 * Limits of the file picker (components/AttachmentPicker): GET /school-posts/attachment-limits = max files, the sizes
 * of system_settings (upload.max_file_mb / upload.max_video_mb, read at each call, never hard-coded) and the 15 types
 * of the attachments bucket. { limits: null while loading, error, reload }.
 */
export function useAttachmentLimits() {
  const [state, setState] = useState({ limits: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ limits: null, error: '' });
    getAttachmentLimits({ signal: controller.signal })
      .then((limits) => setState({ limits, error: '' }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setState({ limits: null, error: feedErrorText(err, 'Không tải được giới hạn tệp. Vui lòng thử lại.') });
      });
    return () => controller.abort();
  }, [attempt]);
  return { ...state, reload: () => setAttempt((n) => n + 1) };
}

// Why "Đăng bài" / "Lưu thay đổi" is locked while files are being prepared.
export const UPLOADING_HINT = 'Đang tải tệp đính kèm lên. Vui lòng chờ tải xong rồi đăng.';

// §8: an announcement needs a grade or a class; until then it cannot be posted / saved (button locked).
export const audienceMissing = (postType, audience) => postType === 'ANNOUNCEMENT' && isAudienceEmpty(audience);

/**
 * Scope labels of a selection ("Gửi tới", with the roles: AudienceLine / audienceText), in the picker's order:
 * grades, then classes. `extraClasses` are targets of an edited post that are not offered (classes of another school
 * year). Empty selection = whole school for NEWS (§8); null for an ANNOUNCEMENT = nothing chosen yet, never
 * "Toàn trường" (the server would refuse it with MSG_AUDIENCE_REQUIRED).
 */
export function audienceLabels(postType, audience, options, extraClasses = []) {
  if (audienceMissing(postType, audience)) return null;
  if (isAudienceEmpty(audience)) return ['Toàn trường'];
  const grades = new Set(audience.gradeLevelIds);
  const classes = new Set(audience.classIds);
  const labels = options.grades.filter((g) => grades.has(g.gradeLevelId)).map((g) => `Khối ${g.gradeLevelName}`);
  const named = new Set();
  for (const c of [...options.classes, ...extraClasses]) {
    if (!classes.has(c.classId) || named.has(c.classId)) continue;
    named.add(c.classId);
    labels.push(`Lớp ${c.className}`);
  }
  return labels.length ? labels : ['Lớp đã chọn'];
}

/**
 * One toggle chip for every on / off choice of the audience (grades, classes, roles): a small check box at the start,
 * empty when off; on = solid ink chip with a white tick. `covered` = a class already inside a chosen grade (ticked,
 * dashed, not clickable). `hint` = a short muted note after the name ("chưa có lớp").
 */
function OptionChip({ on, covered, bad, disabled, onClick, children, hint, title, describedBy }) {
  return (
    <button
      type="button"
      className={`spf-chip${on ? ' is-on' : ''}${covered ? ' is-covered' : ''}${bad ? ' is-bad' : ''}`}
      aria-pressed={Boolean(on || covered)}
      disabled={disabled || covered}
      onClick={onClick}
      title={title}
      aria-describedby={describedBy}
    >
      <span className="spf-chip-box" aria-hidden="true">
        {(on || covered) && <Icon name="check" size="sm" />}
      </span>
      <span className="spf-chip-text">{children}</span>
      {hint && <span className="spf-chip-hint">{hint}</span>}
    </button>
  );
}

const fold = (text) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/\s+/g, '')
    .toLowerCase();

/**
 * The role dimension, AFTER the grades and classes: the scope is chosen first ("khối 10"), the roles only narrow it
 * ("chỉ phụ huynh"). Three toggle chips "Học sinh · Phụ huynh · Giáo viên", all on by default. None on = every role,
 * said in the help. The help also says that the homeroom teacher of a chosen class always gets the post (decision 2,
 * server rule).
 */
function RoleRow({ id, roles, onChange, disabled }) {
  const none = roles.length === 0;
  const toggle = (role) =>
    onChange(roles.includes(role) ? roles.filter((r) => r !== role) : TARGETABLE_ROLES.filter((r) => r === role || roles.includes(r)));
  return (
    <div className="spf-audience-group spf-roles" role="group" aria-labelledby={`${id}-roles`} aria-describedby={`${id}-roles-help`}>
      <span id={`${id}-roles`} className="label-upper">
        Vai trò nhận bài
      </span>
      <div className="spf-chips">
        {TARGETABLE_ROLES.map((role) => (
          <OptionChip key={role} on={roles.includes(role)} disabled={disabled} onClick={() => toggle(role)}>
            {ROLE_LABELS[role]}
          </OptionChip>
        ))}
      </div>
      <p id={`${id}-roles-help`} className={`field-help spf-roles-help${none ? ' is-all' : ''}`} aria-live="polite">
        {none
          ? 'Chưa chọn vai trò nào, nên học sinh, phụ huynh và giáo viên trong phạm vi đã chọn ở trên đều nhận bài.'
          : 'Chọn vai trò để thu hẹp người nhận trong phạm vi khối và lớp đã chọn ở trên. Giáo viên chủ nhiệm của lớp được chọn luôn nhận bài.'}
      </p>
    </div>
  );
}

/**
 * The whole audience, top to bottom as a school office thinks it: grades, classes of the current year, "Bỏ chọn khối
 * và lớp", then the roles that narrow it, then one "Gửi tới" line for both dimensions.
 * Multi-select of grades and classes as toggle chips (wrapping rows, so nothing overflows on a narrow screen).
 * - Choosing a grade removes its classes from the selection (the grade already covers them); their chips show as
 *   covered. ASSUMPTION: a class inside a chosen grade adds nobody, so keeping both is pointless.
 * - "Toàn trường" (NEWS) / "Bỏ chọn khối và lớp" (ANNOUNCEMENT) clears the selection (not the roles).
 * - staleClasses: targets of an edited post outside the current year; they can only be removed (UC-61 refuses them).
 */
export function AudiencePicker({
  postType,
  options,
  value,
  onChange,
  roles,
  onRolesChange,
  disabled,
  error,
  bad,
  staleClasses = [],
  note,
}) {
  const id = useId();
  const [filter, setFilter] = useState('');
  const announcement = postType === 'ANNOUNCEMENT';
  const empty = isAudienceEmpty(value);
  const chosenGrades = new Set(value.gradeLevelIds);
  const chosenClasses = new Set(value.classIds);
  const badGrades = new Set(bad?.gradeLevelIds ?? []);
  const badClasses = new Set(bad?.classIds ?? []);

  const byGrade = useMemo(() => {
    const groups = options.grades.map((g) => ({ ...g, classes: [] }));
    const index = new Map(groups.map((g) => [g.gradeLevelName, g]));
    const others = { gradeLevelId: null, gradeLevelName: '', classes: [] };
    for (const c of options.classes) (index.get(c.gradeLevelName) ?? others).classes.push(c);
    return others.classes.length ? [...groups, others] : groups;
  }, [options.grades, options.classes]);

  // Grades with no class in the current year: a post to such a grade reaches nobody through a class for now. Still
  // allowed (§8 does not forbid it; classes may be created later), so they are only marked and warned about.
  const emptyGradeIds = new Set(byGrade.filter((g) => g.gradeLevelId !== null && !g.classes.length).map((g) => g.gradeLevelId));
  const chosenEmptyGrades = options.grades.filter((g) => emptyGradeIds.has(g.gradeLevelId) && chosenGrades.has(g.gradeLevelId));

  const needle = fold(filter);
  // While filtering, only the grades with a matching class; otherwise every grade, the empty ones with their note.
  const visible = byGrade
    .map((g) => ({ ...g, classes: needle ? g.classes.filter((c) => fold(c.className).includes(needle)) : g.classes }))
    .filter((g) => g.classes.length || (!needle && g.gradeLevelId !== null && options.classes.length > 0));

  function toggleGrade(grade) {
    if (chosenGrades.has(grade.gradeLevelId)) {
      onChange({ ...value, gradeLevelIds: value.gradeLevelIds.filter((x) => x !== grade.gradeLevelId) });
      return;
    }
    const inGrade = new Set(options.classes.filter((c) => c.gradeLevelName === grade.gradeLevelName).map((c) => c.classId));
    onChange({
      gradeLevelIds: [...value.gradeLevelIds, grade.gradeLevelId],
      classIds: value.classIds.filter((x) => !inGrade.has(x)),
    });
  }
  function toggleClass(classId) {
    const classIds = chosenClasses.has(classId) ? value.classIds.filter((x) => x !== classId) : [...value.classIds, classId];
    onChange({ ...value, classIds });
  }

  const scopeLabels = audienceLabels(postType, value, options, staleClasses);
  const describedBy = `${id}-summary${error ? ` ${id}-error` : ''}`;

  return (
    <fieldset className={`spf-audience${error ? ' invalid' : ''}`} aria-describedby={describedBy} id="spf-audience">
      <legend className="spf-label">
        Đối tượng nhận {announcement ? <span className="spf-required">*</span> : <span className="caption muted">(tuỳ chọn)</span>}
      </legend>
      <p className="field-help spf-audience-help">
        {announcement
          ? 'Thông báo cần ít nhất một khối hoặc một lớp. Chọn cả khối thì mọi lớp trong khối đều nhận. Sau đó có thể thu hẹp theo vai trò.'
          : 'Không chọn khối hay lớp nào thì tin tức dành cho toàn trường. Chọn cả khối thì mọi lớp trong khối đều nhận. Sau đó có thể thu hẹp theo vai trò.'}
      </p>

      {options.loading && <p className="caption muted spf-audience-loading">Đang tải danh sách khối và lớp…</p>}
      {!options.loading && options.error && (
        <div className="spf-audience-loaderror">
          <p className="form-error" role="alert">
            {options.error}
          </p>
          <button type="button" className="btn btn-secondary" onClick={options.reload}>
            <Icon name="refresh" size="sm" />
            Thử lại
          </button>
        </div>
      )}

      {!options.loading && !options.error && (
        <>
          <div className="spf-audience-group" role="group" aria-labelledby={`${id}-grades`}>
            <span id={`${id}-grades`} className="label-upper">
              Khối
            </span>
            <div className="spf-chips">
              {!announcement && (
                // NEWS: "Toàn trường" is the empty selection, first of the scope choices; choosing it clears the
                // grades and classes (not the roles).
                <OptionChip on={empty} disabled={disabled} onClick={() => onChange(emptyAudience())}>
                  Toàn trường
                </OptionChip>
              )}
              {options.grades.map((g) => (
                <OptionChip
                  key={g.gradeLevelId}
                  on={chosenGrades.has(g.gradeLevelId)}
                  bad={badGrades.has(g.gradeLevelId)}
                  disabled={disabled}
                  onClick={() => toggleGrade(g)}
                  hint={emptyGradeIds.has(g.gradeLevelId) ? 'chưa có lớp' : undefined}
                >
                  Khối {g.gradeLevelName}
                </OptionChip>
              ))}
            </div>
            {chosenEmptyGrades.length > 0 && (
              <div className="notice amber spf-empty-grade" role="status">
                <Icon name="warning" size="sm" />
                <p>
                  {chosenEmptyGrades.map((g) => `Khối ${g.gradeLevelName}`).join(', ')} chưa có lớp nào trong năm học
                  hiện tại, nên lúc này chưa ai nhận bài qua{' '}
                  {chosenEmptyGrades.length > 1 ? 'các khối này' : 'khối này'}. Bài vẫn đăng được; khi có lớp, người
                  trong lớp sẽ thấy bài trên bảng tin nhưng không nhận thông báo.
                </p>
              </div>
            )}
          </div>

          <div className="spf-audience-group" role="group" aria-labelledby={`${id}-classes`}>
            <div className="spf-audience-group-head">
              <span id={`${id}-classes`} className="label-upper">
                Lớp · năm học hiện tại
              </span>
              {options.classes.length > 12 && (
                <div className="input-wrap spf-filter">
                  <Icon name="search" size="sm" className="spf-filter-icon" />
                  <input
                    className="input"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Lọc lớp, ví dụ 11D"
                    aria-label="Lọc danh sách lớp"
                    autoComplete="off"
                  />
                </div>
              )}
            </div>
            {options.classes.length === 0 && (
              <p className="caption muted">Năm học hiện tại chưa có lớp nào. Bạn vẫn có thể chọn theo khối.</p>
            )}
            {options.classes.length > 0 && visible.length === 0 && (
              <p className="caption muted">Không có lớp nào khớp với từ khoá.</p>
            )}
            {visible.map((g) => {
              const gradeOn = g.gradeLevelId !== null && chosenGrades.has(g.gradeLevelId);
              return (
                <div key={g.gradeLevelId ?? 'other'} className="spf-class-row">
                  <span className="spf-class-grade caption">{g.gradeLevelName ? `Khối ${g.gradeLevelName}` : 'Khác'}</span>
                  {g.classes.length === 0 ? (
                    <span className="caption spf-class-none">Chưa có lớp nào trong năm học hiện tại.</span>
                  ) : (
                    <div className="spf-chips">
                      {g.classes.map((c) => {
                        const on = chosenClasses.has(c.classId);
                        return (
                          <OptionChip
                            key={c.classId}
                            on={on}
                            covered={gradeOn && !on}
                            bad={badClasses.has(c.classId)}
                            disabled={disabled}
                            onClick={() => toggleClass(c.classId)}
                            title={gradeOn && !on ? `Đã gồm trong Khối ${g.gradeLevelName}` : undefined}
                          >
                            {c.className}
                          </OptionChip>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {staleClasses.length > 0 && (
            <div className="spf-audience-group spf-stale" role="group" aria-labelledby={`${id}-stale`}>
              <span id={`${id}-stale`} className="label-upper">
                Lớp của năm học khác
              </span>
              <div className="spf-chips">
                {staleClasses
                  .filter((c) => chosenClasses.has(c.classId))
                  .map((c) => (
                    <button
                      key={c.classId}
                      type="button"
                      className="spf-chip is-on is-stale"
                      onClick={() => toggleClass(c.classId)}
                      disabled={disabled}
                      title={`Năm học ${String(c.schoolYearName ?? '').replace('-', ' – ')}`}
                      aria-label={`Bỏ lớp ${c.className}`}
                    >
                      <span>Lớp {c.className}</span>
                      <Icon name="close" size="sm" />
                    </button>
                  ))}
              </div>
              <p className="field-help">
                Bài đang gửi tới lớp của năm học khác. Nếu đổi đối tượng nhận, hãy bỏ các lớp này vì chỉ chọn được lớp
                của năm học hiện tại.
              </p>
            </div>
          )}

          {announcement && (
            // After the grades and classes, so it clearly clears only them (the roles below are kept).
            <div className="spf-audience-row">
              <button
                type="button"
                className="btn btn-tertiary spf-clear"
                onClick={() => onChange(emptyAudience())}
                disabled={disabled || empty}
              >
                <Icon name="clear_all" size="sm" />
                Bỏ chọn khối và lớp
              </button>
            </div>
          )}
        </>
      )}

      <RoleRow id={id} roles={roles} onChange={onRolesChange} disabled={disabled} />

      <div className={`spf-audience-summary${scopeLabels ? '' : ' is-pending'}`} id={`${id}-summary`} aria-live="polite">
        <span className="caption muted spf-audience-summary-label">Gửi tới:</span>
        <AudienceLine scopeLabels={scopeLabels} roles={roles} max={SHORT_SCOPE} />
      </div>
      {note}
      {error && (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

// --- Type, title, notification ---------------------------------------------------------------------------------

// Segmented control as the Stitch design. Read only on SCR-06 (the type cannot change after posting).
export function PostTypeSwitch({ value, onChange, disabled, readOnly }) {
  const refs = useRef({});
  const types = ['ANNOUNCEMENT', 'NEWS'];
  function onKeyDown(e) {
    if (readOnly || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const next = types[(types.indexOf(value) + 1) % types.length];
    onChange(next);
    refs.current[next]?.focus();
  }
  return (
    <div
      className={`spf-type${readOnly ? ' is-readonly' : ''}`}
      role="radiogroup"
      aria-label="Loại bài"
      aria-readonly={readOnly || undefined}
      aria-describedby="spf-type-help"
    >
      {types.map((type) => {
        const on = value === type;
        return (
          <button
            key={type}
            ref={(el) => {
              refs.current[type] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className={on ? 'is-on' : ''}
            disabled={disabled || (readOnly && !on)}
            onClick={() => !readOnly && onChange(type)}
            onKeyDown={onKeyDown}
          >
            <Icon name={POST_TYPE_INFO[type].icon} size="sm" />
            {POST_TYPE_LABELS[type]}
          </button>
        );
      })}
    </div>
  );
}

export function TitleCounter({ value, id }) {
  const left = MAX_TITLE_LENGTH - titleLength(value);
  return (
    <span id={id} className={`caption mono spf-counter${left < 0 ? ' is-over' : ''}`} aria-live="polite">
      {left >= 0 ? `Còn ${left.toLocaleString('vi-VN')} ký tự` : `Vượt ${(-left).toLocaleString('vi-VN')} ký tự`}
    </span>
  );
}

// --- Checks and server errors ----------------------------------------------------------------------------------

export const AUDIENCE_REQUIRED = 'Thông báo phải chọn ít nhất một khối hoặc một lớp.';
// Why "Đăng bài" / "Lưu thay đổi" is locked (footer line and button title).
export const AUDIENCE_REQUIRED_HINT = 'Thông báo phải gửi tới ít nhất một khối hoặc một lớp. Hãy chọn ở mục Đối tượng nhận.';

// Same limits as the server, so a request that would be refused is never sent.
export function validatePost({ title, content, postType, audience }) {
  const errors = {};
  const length = titleLength(title);
  if (length === 0) errors.title = 'Vui lòng nhập tiêu đề.';
  else if (length > MAX_TITLE_LENGTH) errors.title = `Tiêu đề tối đa ${MAX_TITLE_LENGTH} ký tự.`;
  if (!normalizeContent(content)) errors.content = 'Vui lòng nhập nội dung.';
  if (postType === 'ANNOUNCEMENT' && isAudienceEmpty(audience)) errors.audience = AUDIENCE_REQUIRED;
  return errors;
}

// TODO FE-08: move these to messages.js once the lead approves the codes (waiting list in the FE-08 summary).
// MSG_REQUIRED and MSG_CLASS_NOT_FOUND already exist in messages.js with a general text; the form shows its own,
// closer to the field.
const FORM_MESSAGES = {
  MSG_AUDIENCE_REQUIRED: AUDIENCE_REQUIRED,
  MSG_SCHOOL_POST_NOT_FOUND: 'Không tìm thấy bài viết.',
  MSG_GRADE_NOT_FOUND: 'Không tìm thấy khối lớp.',
  MSG_CLASS_NOT_FOUND: 'Không tìm thấy lớp học.',
  MSG_FIELD_NOT_EDITABLE: 'Một số thông tin không thể sửa ở đây.',
  MSG_REQUIRED: 'Trường này là bắt buộc.',
  MSG_INVALID_PARAM: 'Giá trị không hợp lệ.',
  MSG_TOO_MANY_ATTACHMENTS: 'Bài viết có quá nhiều tệp đính kèm.',
};
const FIELD_NAMES = { title: 'Tiêu đề', content: 'Nội dung', postType: 'Loại bài', sendNotification: 'Gửi thông báo' };

/**
 * Where to show a UC-60 / UC-61 error: { field: 'title' | 'content' | 'audience' | null, text, bad?, notFound? }.
 * 401 / 403 are handled by client.js and ProtectedRoute; an unknown code gets `fallback` and a console warning.
 */
export function saveErrorOf(err, fallback) {
  const code = err?.code;
  const field = err?.details?.field;
  if (err?.status === 404 || code === 'MSG_SCHOOL_POST_NOT_FOUND') {
    return { field: null, text: FORM_MESSAGES.MSG_SCHOOL_POST_NOT_FOUND, notFound: true };
  }
  if (code === 'MSG_AUDIENCE_REQUIRED') return { field: 'audience', text: FORM_MESSAGES[code] };
  if (code === 'MSG_TOO_MANY_ATTACHMENTS') {
    return { field: null, text: `Mỗi bài viết có tối đa ${err.details?.max ?? 10} tệp đính kèm. Hãy gỡ bớt tệp.` };
  }
  if (field === 'attachments' || field === 'removeAttachmentIds' || (code === 'MSG_UPLOAD_FAILED' && err.details?.storageKey)) {
    return { field: null, text: 'Một tệp đính kèm không còn dùng được. Hãy gỡ tệp đó, tải lên lại rồi thử lần nữa.' };
  }
  if (code === 'MSG_GRADE_NOT_FOUND' || code === 'MSG_CLASS_NOT_FOUND') {
    return {
      field: 'audience',
      text: `${FORM_MESSAGES[code]} Danh sách đã được tải lại, vui lòng chọn lại các mục được đánh dấu.`,
      bad: { gradeLevelIds: err.details?.gradeLevelIds ?? [], classIds: err.details?.classIds ?? [] },
    };
  }
  if (code === 'MSG_FIELD_NOT_EDITABLE') {
    // Programming error: the form must never send these fields.
    const fields = err.details?.fields ?? [];
    console.warn('[SchoolPostForm] The server refused fields this form must never send:', fields);
    const names = fields.map((f) => FIELD_NAMES[f] ?? f).join(', ');
    return { field: null, text: `${FORM_MESSAGES[code]} Trường bị từ chối: ${names}. Vui lòng báo cho nhóm phát triển.` };
  }
  if ((code === 'MSG_INVALID_PARAM' || code === 'MSG_REQUIRED') && (field === 'title' || field === 'content')) {
    const text = field === 'title' ? 'Tiêu đề không hợp lệ.' : 'Vui lòng nhập nội dung.';
    return { field, text };
  }
  if (FORM_MESSAGES[code]) return { field: null, text: FORM_MESSAGES[code] };
  return { field: null, text: feedErrorText(err, fallback) };
}

// --- Preview and confirmation ----------------------------------------------------------------------------------

// Live preview as the post will look in the feed (Stitch "Xem trước trên Bảng tin"). files = the attachments the post
// will have ([{ mimeType, previewUrl? }]): the card shows the first picture (as UC-58 firstImageUrl) and the count.
export function PostPreview({ postType, title, content, labels, roles, authorName, files = [] }) {
  const announcement = postType === 'ANNOUNCEMENT';
  const cleanTitle = normalizeTitle(title);
  const text = normalizeContent(content);
  const picture = files.find((f) => f.mimeType?.startsWith('image/') && f.previewUrl)?.previewUrl;
  return (
    <aside className="spf-preview" aria-label="Xem trước trên bảng tin">
      <div className="spf-preview-head">
        <span className="title-sm">Xem trước trên bảng tin</span>
        <span className="caption muted spf-preview-live">
          <Icon name="visibility" size="sm" />
          Cập nhật khi soạn
        </span>
      </div>
      <article className="spf-preview-card">
        <p className={`label-upper spf-preview-kind${announcement ? '' : ' is-news'}`}>
          <Icon name={POST_TYPE_INFO[postType].icon} size="sm" />
          {POST_TYPE_LABELS[postType]}
        </p>
        <h3 className={`spf-preview-title${cleanTitle ? '' : ' is-empty'}`}>{cleanTitle || 'Tiêu đề bài viết'}</h3>
        <p className="caption muted spf-preview-meta">
          {authorName && <span>{authorName}</span>}
          {authorName && <span aria-hidden="true"> · </span>}
          <span>
            Gửi tới: <AudienceLine scopeLabels={labels} roles={roles} max={SHORT_SCOPE} />
          </span>
        </p>
        <p className={`spf-preview-text${text ? '' : ' is-empty'}`}>{text || 'Nội dung bài viết sẽ hiện ở đây.'}</p>
        {picture && (
          <figure className="spf-preview-image">
            <img src={picture} alt="" />
          </figure>
        )}
        {files.length > 0 && (
          <p className="caption muted spf-preview-files">
            <Icon name="attach_file" size="sm" />
            {files.length} tệp đính kèm
          </p>
        )}
        <p className="caption spf-preview-foot">
          <Icon name={announcement ? 'favorite' : 'menu_book'} size="sm" />
          {announcement ? 'Người nhận thích và bình luận được' : 'Chỉ để đọc'}
        </p>
      </article>
    </aside>
  );
}

/**
 * UC-60 confirmation before posting: a post with a notification reaches many people and cannot be taken back (an
 * edit does not send it again). Native <dialog> as FE-02 SCR-11; the safe button "Quay lại" gets the focus, never
 * the confirm button.
 */
export function ConfirmPostDialog({ open, title, postType, labels, roles, sendNotification, busy, onCancel, onConfirm }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="sf-dialog"
      aria-labelledby="spf-confirm-title"
      aria-describedby="spf-confirm-desc"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="sf-dialog-head">
        <Icon name="send" />
        <h2 id="spf-confirm-title" className="title-sm">
          Xác nhận đăng bài
        </h2>
      </div>
      <div id="spf-confirm-desc">
        <p className="sf-dialog-quote">{normalizeTitle(title)}</p>
        <dl className="sf-dialog-facts">
          <dt>Loại bài</dt>
          <dd>{POST_TYPE_LABELS[postType]}</dd>
          <dt>Gửi tới</dt>
          {/* Every grade and class, never shortened: the last check before it reaches everyone. */}
          <dd>
            <AudienceLine scopeLabels={labels} roles={roles} />
          </dd>
          <dt>Thông báo</dt>
          <dd>{sendNotification ? 'Có gửi, người nhận sẽ thấy trong chuông' : 'Không gửi thông báo'}</dd>
        </dl>
        {sendNotification ? (
          <div className="notice amber">
            <Icon name="warning" size="sm" />
            <p>
              Thông báo được gửi ngay khi đăng và không thu hồi được. Sửa bài sau này cũng không gửi lại thông báo.
            </p>
          </div>
        ) : (
          <div className="notice ink">
            <Icon name="info" size="sm" />
            <p>Bài hiển thị ngay trên bảng tin của người nhận, không kèm thông báo trong chuông.</p>
          </div>
        )}
      </div>
      <div className="sf-dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy} autoFocus>
          Quay lại
        </button>
        <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy}>
          <Icon name={busy ? 'progress_activity' : 'send'} size="sm" className={busy ? 'sf-spin' : undefined} />
          {busy ? 'Đang đăng…' : 'Đăng bài'}
        </button>
      </div>
    </dialog>
  );
}
