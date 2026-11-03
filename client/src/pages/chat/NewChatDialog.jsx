import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { errorText } from '../../messages.js';
import { contactLabel } from './chatText.js';

// UC-49 Send Private Message – "Tin nhắn mới": find someone the active role may write to (people of one's classes;
// School Manager: the teacher group; teachers also the teacher group) and open the 1-1 chat with them. The server
// decides who is listed and sends phone / email only to teachers and the School Manager.
export default function NewChatDialog({ onOpened, onClose }) {
  const ref = useRef(null);
  const [query, setQuery] = useState('');
  const [classId, setClassId] = useState('');
  const [classes, setClasses] = useState([]); // filter options, from the first (unfiltered) load
  const [result, setResult] = useState({ loading: true, error: '', contacts: [], total: 0, limit: 0 });
  const [opening, setOpening] = useState(null);
  const [openError, setOpenError] = useState('');

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  // Search as the user types (a short pause first), and when the class filter changes.
  useEffect(() => {
    let live = true;
    const timer = setTimeout(
      () => {
        setResult((r) => ({ ...r, loading: true, error: '' }));
        api
          .get('/conversations/contacts', { params: { q: query.trim() || undefined, classId: classId || undefined } })
          .then(({ data }) => {
            if (!live) return;
            setResult({ loading: false, error: '', ...data });
            if (!query.trim() && !classId) {
              const seen = new Map();
              data.contacts.forEach((c) => c.classes.forEach((x) => seen.set(x.classId, x.className)));
              setClasses([...seen].map(([id, name]) => ({ classId: id, className: name })));
            }
          })
          .catch((err) => live && setResult((r) => ({ ...r, loading: false, error: errorText(err) })));
      },
      query ? 300 : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, classId]);

  async function open(contact) {
    setOpening(contact.userId);
    setOpenError('');
    try {
      const { data } = await api.post('/conversations/direct', { userId: contact.userId });
      await onOpened(data.groupId);
    } catch (err) {
      setOpenError(errorText(err));
      setOpening(null);
    }
  }

  return (
    <dialog ref={ref} className="group-dialog newchat-dialog" onCancel={onClose} aria-labelledby="newchat-title">
      <div className="newchat-head">
        <h2 id="newchat-title" className="title-md">
          Tin nhắn mới
        </h2>
        <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Đóng">
          <Icon name="close" />
        </button>
      </div>
      <div className="newchat-filters">
        <div className="input-wrap subject-search">
          <Icon name="search" size="sm" className="subject-search-icon" />
          <input
            className="input"
            type="search"
            placeholder="Tìm theo họ tên…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Tìm người để nhắn"
            autoFocus
          />
        </div>
        {classes.length > 1 && (
          <select className="input" value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Lọc theo lớp">
            <option value="">Tất cả lớp</option>
            {classes.map((c) => (
              <option key={c.classId} value={c.classId}>
                Lớp {c.className}
              </option>
            ))}
          </select>
        )}
      </div>
      {openError && (
        <p className="form-error" role="alert">
          {openError}
        </p>
      )}
      <div className="newchat-list">
        {result.error ? (
          <p className="form-error">{result.error}</p>
        ) : result.loading && !result.contacts.length ? (
          <p className="loading">Đang tải…</p>
        ) : !result.contacts.length ? (
          <p className="muted">{query ? 'Không tìm thấy người phù hợp.' : 'Chưa có ai để nhắn tin.'}</p>
        ) : (
          <ul>
            {result.contacts.map((c) => (
              <li key={c.userId}>
                <button
                  type="button"
                  className="newchat-item"
                  onClick={() => open(c)}
                  disabled={opening !== null}
                >
                  <Avatar src={c.avatarUrl} name={c.fullName} size={36} />
                  <span className="newchat-text">
                    <span className="chat-item-name">{c.fullName}</span>
                    <span className="caption muted">{contactLabel(c)}</span>
                    {(c.phone || c.email) && (
                      <span className="caption muted">{[c.phone, c.email].filter(Boolean).join(' · ')}</span>
                    )}
                  </span>
                  <span className="caption newchat-action">
                    {opening === c.userId ? 'Đang mở…' : c.directGroupId ? 'Mở trò chuyện' : 'Nhắn tin'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {result.total > result.contacts.length && (
        <p className="caption muted">
          Đang hiện {result.contacts.length} trên {result.total} người. Nhập tên để tìm nhanh hơn.
        </p>
      )}
    </dialog>
  );
}
