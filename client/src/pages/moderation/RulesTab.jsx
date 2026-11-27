import { useEffect, useState } from 'react';
import { createRule, deleteRule, listRules, testRules, updateRule } from '../../api/moderation.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import ModDialog from './ModDialog.jsx';
import { RULE_CATEGORIES, categoryLabel, formatWhen } from './moderationText.js';
import StatsFilters, { filterParams } from './StatsFilters.jsx';

// Tab "Quy tắc" (moderation phase 6, FE-08 Anh): the rules of the automatic check with how often each one matched and
// how often those matches were unhidden in the period (a high share = a rule hiding innocent content). Add, edit, turn
// off / on, delete; every change is in force as soon as the server answers. "Thử một câu" shows which rules a
// sentence would match, without writing anything.

const MATCH_TEXT = { WORD: 'Từ', PHRASE: 'Cụm từ' };
const EMPTY_RULE = { pattern: '', matchType: 'WORD', accentInsensitive: false, category: 'INAPPROPRIATE_LANGUAGE', isActive: true };

export default function RulesTab({ filters, onFilters }) {
  const toast = useToast();
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(null); // { rule } (rule.ruleId absent = new)
  const [deleting, setDeleting] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: '' }));
    const { from, to } = filterParams(filters);
    listRules({ from, to }, { signal: controller.signal })
      .then((data) => setState({ loading: false, data, error: '' }))
      .catch((err) => {
        if (!controller.signal.aborted) setState({ loading: false, data: null, error: errorText(err) });
      });
    return () => controller.abort();
  }, [filters, attempt]);

  const reload = () => setAttempt((n) => n + 1);

  async function toggle(rule) {
    setBusyId(rule.ruleId);
    try {
      await updateRule(rule.ruleId, { isActive: !rule.isActive });
      toast(rule.isActive ? 'Đã tắt quy tắc.' : 'Đã bật lại quy tắc.');
      reload();
    } catch (err) {
      toast(errorText(err), { type: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  const { data } = state;
  return (
    <section aria-label="Quy tắc">
      <TestSentence />
      <StatsFilters value={filters} onChange={onFilters} fields={['period']} />
      <div className="mod-toolbar">
        <p className="caption muted">
          {data && `${data.items.length} quy tắc · số lần khớp và bị gỡ ẩn từ ${formatWhen(data.from)} đến ${formatWhen(data.to)}`}
        </p>
        <button type="button" className="btn btn-primary" onClick={() => setEditing({ rule: { ...EMPTY_RULE } })}>
          <Icon name="add" size="sm" />
          Thêm quy tắc
        </button>
      </div>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <div className="table-scroll card card-outline mod-table-card" aria-busy={state.loading}>
        <table className="table mod-table">
          <thead>
            <tr>
              <th>Từ / cụm từ</th>
              <th>Kiểu khớp</th>
              <th>Khớp cả không dấu</th>
              <th>Loại vi phạm</th>
              <th className="num">Số lần khớp</th>
              <th className="num">Số lần bị gỡ ẩn</th>
              <th>Trạng thái</th>
              <th aria-label="Thao tác" />
            </tr>
          </thead>
          <tbody>
            {data?.items.map((r) => (
              <tr key={r.ruleId} className={r.isActive ? '' : 'mod-row-off'}>
                <td className="mod-pattern">{r.pattern}</td>
                <td>{MATCH_TEXT[r.matchType]}</td>
                <td>{r.accentInsensitive ? 'Có' : 'Không'}</td>
                <td>{categoryLabel(r.category)}</td>
                <td className="num mono">{r.matchCount}</td>
                <td className={`num mono${r.unhideCount > 0 ? ' mod-warn' : ''}`}>{r.unhideCount}</td>
                <td>
                  <span className={`pill${r.isActive ? ' green' : ''}`}>{r.isActive ? 'Đang dùng' : 'Đã tắt'}</span>
                </td>
                <td className="nowrap mod-actions">
                  <button type="button" className="btn btn-tertiary" onClick={() => setEditing({ rule: r })} aria-label={`Sửa quy tắc ${r.pattern}`}>
                    <Icon name="edit" size="sm" />
                  </button>
                  <button type="button" className="btn btn-tertiary" onClick={() => toggle(r)} disabled={busyId === r.ruleId} aria-label={`${r.isActive ? 'Tắt' : 'Bật'} quy tắc ${r.pattern}`} title={r.isActive ? 'Tắt' : 'Bật'}>
                    <Icon name={r.isActive ? 'toggle_on' : 'toggle_off'} size="sm" />
                  </button>
                  <button type="button" className="btn btn-tertiary" onClick={() => setDeleting(r)} aria-label={`Xoá quy tắc ${r.pattern}`} title="Xoá">
                    <Icon name="delete" size="sm" />
                  </button>
                </td>
              </tr>
            ))}
            {data && !data.items.length && (
              <tr>
                <td colSpan={8} className="empty-row">Chưa có quy tắc nào.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <RuleDialog
          rule={editing.rule}
          onClose={() => setEditing(null)}
          onSaved={(created) => {
            setEditing(null);
            toast(created ? 'Đã thêm quy tắc. Quy tắc có hiệu lực ngay.' : 'Đã lưu quy tắc. Thay đổi có hiệu lực ngay.');
            reload();
          }}
        />
      )}
      {deleting && (
        <DeleteRuleDialog
          rule={deleting}
          onClose={() => setDeleting(null)}
          onDone={() => {
            setDeleting(null);
            toast('Đã xoá quy tắc.');
            reload();
          }}
        />
      )}
    </section>
  );
}

function TestSentence() {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      setResult(await testRules(text));
    } catch (err) {
      setError(errorText(err));
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card card-outline mod-test" onSubmit={run}>
      <label htmlFor="mod-test-text" className="field-label">Thử một câu</label>
      <div className="mod-test-row">
        <input id="mod-test-text" className="input" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="Nhập một câu để xem quy tắc nào khớp…" />
        <button type="submit" className="btn btn-secondary" disabled={busy || !text.trim()}>
          <Icon name={busy ? 'progress_activity' : 'rule'} size="sm" />
          Thử
        </button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {result && (
        <p className={`notice${result.matched ? ' amber' : ''} mod-test-result`} role="status">
          <Icon name={result.matched ? 'visibility_off' : 'check_circle'} size="sm" />
          <span>
            {result.matched
              ? `Câu này sẽ bị ẩn: ${categoryLabel(result.category).toLowerCase()}. Quy tắc khớp: ${result.rules
                  .map((r) => `“${r.pattern}” (${categoryLabel(r.category).toLowerCase()})`)
                  .join(', ')}.`
              : 'Câu này không khớp quy tắc nào.'}
          </span>
        </p>
      )}
    </form>
  );
}

function RuleDialog({ rule, onClose, onSaved }) {
  const isNew = !rule.ruleId;
  const [form, setForm] = useState({
    pattern: rule.pattern,
    matchType: rule.matchType,
    accentInsensitive: rule.accentInsensitive,
    category: rule.category,
    isActive: rule.isActive,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setError('');
  };

  async function save() {
    setBusy(true);
    setError('');
    try {
      if (isNew) await createRule(form);
      else {
        const changes = Object.fromEntries(Object.entries(form).filter(([k, v]) => rule[k] !== v));
        if (Object.keys(changes).length) await updateRule(rule.ruleId, changes);
      }
      onSaved(isNew);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <ModDialog
      title={isNew ? 'Thêm quy tắc' : 'Sửa quy tắc'}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Huỷ
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !form.pattern.trim()}>
            <Icon name={busy ? 'progress_activity' : 'save'} size="sm" />
            {busy ? 'Đang lưu…' : 'Lưu'}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="mod-rule-pattern" className="field-label">Từ hoặc cụm từ</label>
        <input id="mod-rule-pattern" className="input" value={form.pattern} maxLength={100} onChange={(e) => set({ pattern: e.target.value })} autoFocus />
        <span className="field-help">Chữ thường, giữ dấu như người ta gõ. Tên vùng miền đứng riêng không dùng được làm quy tắc.</span>
      </div>
      <div className="field">
        <label htmlFor="mod-rule-match" className="field-label">Kiểu khớp</label>
        <select id="mod-rule-match" className="input" value={form.matchType} onChange={(e) => set({ matchType: e.target.value })}>
          <option value="WORD">Từ: khớp đúng một từ nguyên vẹn</option>
          <option value="PHRASE">Cụm từ: các từ liền nhau, đúng thứ tự</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="mod-rule-category" className="field-label">Loại vi phạm</label>
        <select id="mod-rule-category" className="input" value={form.category} onChange={(e) => set({ category: e.target.value })}>
          {RULE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{categoryLabel(c)}</option>
          ))}
        </select>
      </div>
      <label className="mod-check">
        <input type="checkbox" checked={form.accentInsensitive} onChange={(e) => set({ accentInsensitive: e.target.checked })} />
        <span>Khớp cả khi gõ không dấu (chỉ bật khi bản không dấu không trùng từ thường nào, tối thiểu 3 chữ cái)</span>
      </label>
      <label className="mod-check">
        <input type="checkbox" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
        <span>Đang dùng</span>
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
    </ModDialog>
  );
}

function DeleteRuleDialog({ rule, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function confirm() {
    setBusy(true);
    try {
      await deleteRule(rule.ruleId);
      onDone();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }
  return (
    <ModDialog
      title="Xoá quy tắc?"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy} autoFocus>
            Giữ lại
          </button>
          <button type="button" className="btn btn-primary sf-btn-danger" onClick={confirm} disabled={busy}>
            {busy ? 'Đang xoá…' : 'Xoá quy tắc'}
          </button>
        </>
      }
    >
      <p>
        Quy tắc “{rule.pattern}” sẽ không còn được dùng để kiểm. Các lần vi phạm đã ghi vẫn giữ nguyên. Nếu chỉ muốn ngừng
        tạm thời, hãy tắt quy tắc thay vì xoá.
      </p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </ModDialog>
  );
}
