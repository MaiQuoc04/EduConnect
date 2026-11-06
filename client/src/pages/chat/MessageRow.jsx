import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { dayLabel, dayOf, REACTIONS, REACTION_EMOJI, timeOf } from './chatText.js';

// One message of a chat: a day separator when needed, the sender, the quote of the message it answers, the text, the
// reactions and the actions (react, reply, delete). The thread (ChatThread.jsx) holds the state and calls the server.
// A message deleted for everyone shows only a placeholder, which the user can still remove from their own view.
function replyText(reply, me) {
  if (reply.state === 'BEFORE_JOIN') return { who: '', text: 'Tin nhắn trước khi bạn vào nhóm' };
  if (reply.state === 'DELETED') return { who: '', text: 'Tin nhắn đã được xoá' };
  if (reply.state === 'HIDDEN') return { who: '', text: 'Bạn đã xoá tin nhắn này' };
  const who = reply.senderId === me ? 'Bạn' : reply.senderNickname || reply.senderName;
  return { who, text: reply.content };
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
}) {
  const mine = m.senderId === me;
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
              <p className="msg-text">
                {m.isDeleted ? (mine ? 'Bạn đã xoá một tin nhắn' : 'Tin nhắn đã được xoá') : m.content}
              </p>
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
              <button type="button" className="msg-tool" onClick={() => onDelete(m)} aria-label="Xoá tin nhắn" title="Xoá tin nhắn">
                <Icon name="delete" size="sm" />
              </button>
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
