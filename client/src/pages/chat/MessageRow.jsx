import Avatar from '../../components/Avatar.jsx';
import HiddenContent from '../../components/HiddenContent.jsx';
import Icon from '../../components/Icon.jsx';
import { MODERATED_MESSAGE_TEXT } from '../../utils/moderation.js';
import { dayLabel, dayOf, filesText, REACTIONS, REACTION_EMOJI, systemText, timeOf } from './chatText.js';
import MessageFiles from './MessageFiles.jsx';

// One message of a chat: a day separator when needed, the sender, the quote of the message it answers, the text, the
// reactions and the actions (react, reply, delete). The thread (ChatThread.jsx) holds the state and calls the server.
// A message deleted for everyone shows only a placeholder ("Bạn đã xoá một tin nhắn" / "Tin nhắn đã được xoá") with no
// action at all: it is already gone for everybody, so it cannot be deleted again (15/11/2026, business-rules §6).
// A message hidden by the automatic content check (isModerated, moderation 25/11/2026) is a kind of deleted message:
// everyone sees "Tin nhắn đã bị ẩn do vi phạm quy chuẩn cộng đồng"; its sender also gets "Xem tin nhắn" to read it
// in place (components/HiddenContent, 26/11/2026). No action on it either (the server refuses them all).
function replyText(reply, me) {
  if (reply.state === 'BEFORE_JOIN') return { who: '', text: 'Tin nhắn trước khi bạn vào nhóm' };
  if (reply.state === 'DELETED') return { who: '', text: 'Tin nhắn đã được xoá' };
  if (reply.state === 'HIDDEN') return { who: '', text: 'Bạn đã xoá tin nhắn này' };
  const who = reply.senderId === me ? 'Bạn' : reply.senderNickname || reply.senderName;
  return { who, text: reply.content || filesText(reply.attachmentCount) };
}

// "Bạn đã trả lời Lan", "Bin đã trả lời bạn": who answered whom, above the message.
function replyNote(m, me, shortName) {
  const sender = m.senderId === me ? 'Bạn' : shortName;
  const reply = m.replyTo;
  if (reply.state !== 'OK') return `${sender} đã trả lời một tin nhắn`;
  if (reply.senderId === m.senderId) return `${sender} đã trả lời chính mình`;
  return `${sender} đã trả lời ${reply.senderId === me ? 'bạn' : reply.senderNickname || reply.senderName}`;
}

export default function MessageRow({
  message: m,
  me,
  newDay,
  firstOfRun,
  label,
  direct,
  canAct,
  menu,
  nameOf,
  onMenu,
  onReact,
  onReply,
  onDelete,
  onJump,
  onFilesExpired,
  onReport, // moderation (25/11/2026): report someone else's message; reported = already reported from this tab
  reported = false,
}) {
  // A team's system line (15/11/2026): centred, no bubble, no action.
  if (m.type === 'SYSTEM') {
    return (
      <>
        {newDay && (
          <li className="msg-day">
            <span className="caption">{dayLabel(dayOf(m.sentAt))}</span>
          </li>
        )}
        <li id={`msg-${m.messageId}`} className="msg-system">
          <span className="caption">
            {systemText(m, me)}
            <time dateTime={m.sentAt}> · {timeOf(m.sentAt)}</time>
          </span>
        </li>
      </>
    );
  }
  const mine = m.senderId === me;
  const moderated = Boolean(m.isModerated); // always with isDeleted
  const ownModerated = moderated && mine; // the sender still reads it
  const name = m.senderNickname ? `${m.senderNickname} (${m.senderName})` : m.senderName;
  const reply = !m.isDeleted && m.replyTo ? replyText(m.replyTo, me) : null;
  const canJump = !m.isDeleted && m.replyTo?.state === 'OK';
  // With a mouse, clicking anywhere on an answer shows the message it answers; selecting its text does not.
  // On a touch screen a tap shows the actions, and the quote is what goes to the original.
  const onBubbleClick = (e) => {
    if (canJump && window.matchMedia('(hover: hover)').matches) {
      e.stopPropagation();
      if (!window.getSelection()?.toString()) onJump(m.replyTo.messageId);
      return;
    }
    if (m.isDeleted) return; // a deleted message has no actions
    toggle('tools')(e);
  };
  const myReaction = (m.reactions ?? []).find((r) => r.userIds.includes(me))?.code;
  const open = menu?.id === m.messageId ? menu.kind : null;
  // kind: 'tools' (touch), 'react', 'who'.
  const toggle = (kind) => (e) => {
    e.stopPropagation();
    onMenu(open === kind ? null : { id: m.messageId, kind });
  };

  return (
    <>
      {newDay && (
        <li className="msg-day">
          <span className="caption">{dayLabel(dayOf(m.sentAt))}</span>
        </li>
      )}
      <li
        id={`msg-${m.messageId}`}
        className={`msg${mine ? ' mine' : ''}${firstOfRun ? ' first' : ''}${open ? ' has-menu' : ''}`}
      >
        {!mine && !direct && (
          <span className="msg-avatar">{firstOfRun && <Avatar src={m.senderAvatarUrl} name={m.senderName} size={32} />}</span>
        )}
        <div className="msg-body">
          {!mine && !direct && firstOfRun && (
            <p className="msg-sender caption">
              <strong>{name}</strong>
              {label && <span className="muted"> · {label}</span>}
              {m.senderStatus === 'LOCKED' && <span className="pill msg-locked">Đã khoá</span>}
            </p>
          )}
          {reply && (
            <p className="msg-reply-note caption">
              <Icon name="reply" size="sm" />
              {replyNote(m, me, m.senderNickname || m.senderName)}
            </p>
          )}
          <div className="msg-line">
            <div
              className={`msg-bubble${m.isDeleted ? ' is-deleted' : ''}${canJump ? ' can-jump' : ''}`}
              onClick={onBubbleClick}
              title={canJump ? 'Xem tin nhắn gốc' : undefined}
            >
              {reply && (
                <button
                  type="button"
                  className="msg-quote"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canJump) onJump(m.replyTo.messageId);
                  }}
                  aria-disabled={!canJump}
                >
                  {reply.who && <strong>{reply.who}</strong>}
                  <span>{reply.text}</span>
                </button>
              )}
              {!m.isDeleted && <MessageFiles files={m.attachments} onExpired={() => onFilesExpired?.(m.messageId)} />}
              {ownModerated ? (
                <HiddenContent
                  placeholder={MODERATED_MESSAGE_TEXT}
                  showLabel="Xem tin nhắn"
                  content={m.content}
                  textClassName="msg-text"
                />
              ) : (m.isDeleted || m.content) && (
                <p className="msg-text">
                  {moderated
                    ? MODERATED_MESSAGE_TEXT
                    : m.isDeleted
                      ? mine
                        ? 'Bạn đã xoá một tin nhắn'
                        : 'Tin nhắn đã được xoá'
                      : m.content}
                </p>
              )}
              <time className="msg-time" dateTime={m.sentAt}>
                {timeOf(m.sentAt)}
              </time>
            </div>
            <div className="msg-tools" onClick={(e) => e.stopPropagation()}>
              {!m.isDeleted && canAct && (
                <>
                  <button type="button" className="msg-tool" onClick={toggle('react')} aria-label="Thả cảm xúc" title="Thả cảm xúc">
                    <Icon name="add_reaction" size="sm" />
                  </button>
                  <button type="button" className="msg-tool" onClick={() => onReply(m)} aria-label="Trả lời" title="Trả lời">
                    <Icon name="reply" size="sm" />
                  </button>
                </>
              )}
              {!m.isDeleted && (
                <button type="button" className="msg-tool" onClick={() => onDelete(m)} aria-label="Xoá tin nhắn" title="Xoá tin nhắn">
                  <Icon name="delete" size="sm" />
                </button>
              )}
              {/* Report (moderation): someone else's message that is still there – never my own, a system line (no
                  row here), a deleted or a hidden one (both isDeleted). */}
              {!m.isDeleted && !mine && onReport && (
                reported ? (
                  <span className="msg-tool is-reported" title="Đã báo cáo" aria-label="Đã báo cáo tin nhắn này">
                    <Icon name="flag" size="sm" filled />
                  </span>
                ) : (
                  <button type="button" className="msg-tool" onClick={() => onReport(m)} aria-label="Báo cáo tin nhắn" title="Báo cáo">
                    <Icon name="flag" size="sm" />
                  </button>
                )
              )}
              {open === 'react' && (
                <div className="msg-react-bar" role="menu" aria-label="Chọn cảm xúc">
                  {REACTIONS.map((r) => (
                    <button
                      key={r.code}
                      type="button"
                      role="menuitem"
                      className={myReaction === r.code ? 'is-mine' : ''}
                      onClick={() => onReact(m, r.code)}
                      aria-label={r.label}
                      title={r.label}
                    >
                      {r.emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {m.reactions?.length > 0 && (
            <div className="msg-reactions">
              <button type="button" className="msg-reaction-chip" onClick={toggle('who')} aria-label="Xem ai đã thả cảm xúc">
                {m.reactions.map((r) => (
                  <span key={r.code}>{REACTION_EMOJI[r.code]}</span>
                ))}
                <span className="msg-reaction-count">{m.reactions.reduce((n, r) => n + r.userIds.length, 0)}</span>
              </button>
              {open === 'who' && (
                <ul className="msg-who" onClick={(e) => e.stopPropagation()}>
                  {m.reactions.flatMap((r) =>
                    r.userIds.map((id) => (
                      <li key={id}>
                        <span>{REACTION_EMOJI[r.code]}</span> {id === me ? 'Bạn' : nameOf(id)}
                      </li>
                    )),
                  )}
                </ul>
              )}
            </div>
          )}
        </div>
      </li>
    </>
  );
}

// One of my messages not confirmed by the server yet (17/11/2026, business-rules §6 "Sending"), after the real ones:
//   sending – dim, "Đang gửi…";
//   failed  – the reason, then "Thử lại" (when sending again can help and I may still send), "Sửa" (back into the box)
//             and "Xoá" (only drops this copy; a message that was maybe saved after all shows up at the next load).
export function OutboxRow({ message: m, me, canSend, onRetry, onEdit, onDrop }) {
  const failed = m.status === 'failed';
  const reply = m.replyTo;
  const replyWho = reply ? (reply.senderId === me ? 'chính bạn' : reply.senderNickname || reply.senderName) : '';
  return (
    <li className={`msg mine first msg-outbox${failed ? ' is-failed' : ' is-sending'}`} aria-busy={!failed}>
      <div className="msg-body">
        {reply && (
          <p className="msg-reply-note caption">
            <Icon name="reply" size="sm" />
            Bạn đang trả lời {replyWho}
          </p>
        )}
        <div className="msg-line">
          <div className="msg-bubble">
            {m.files.length > 0 && (
              <p className="msg-outbox-files caption">
                <Icon name="attach_file" size="sm" />
                {m.files.length === 1 ? m.files[0].fileName : `${m.files.length} tệp`}
              </p>
            )}
            {m.content && <p className="msg-text">{m.content}</p>}
          </div>
        </div>
        <p className="msg-outbox-state caption" role={failed ? 'alert' : undefined}>
          {failed ? (
            <>
              <Icon name="error" size="sm" />
              <span>{m.unsure ? 'Chưa rõ đã gửi được chưa.' : m.error || 'Không gửi được.'}</span>
              {m.retryable && canSend && (
                <button type="button" className="link-button" onClick={() => onRetry(m.clientMessageId)}>
                  Thử lại
                </button>
              )}
              {canSend && (
                <button type="button" className="link-button" onClick={() => onEdit(m.clientMessageId)}>
                  Sửa
                </button>
              )}
              <button type="button" className="link-button" onClick={() => onDrop(m.clientMessageId)}>
                Xoá
              </button>
            </>
          ) : (
            <>
              <Icon name="schedule" size="sm" />
              Đang gửi…
            </>
          )}
        </p>
      </div>
    </li>
  );
}
