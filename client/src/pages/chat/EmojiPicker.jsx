// UC-112 Insert Emoji: the system's own emoji from a short fixed list (no library, nothing stored apart from the text).
const EMOJI = [
  '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🙂', '😉', '😊', '😇', '🥰', '😍', '😘', '😋',
  '😜', '🤗', '🤔', '🤐', '😐', '😶', '😏', '😌', '😴', '😷', '🤒', '😎', '🤓', '🥳', '😕', '😟',
  '🙁', '😮', '😳', '🥺', '😢', '😭', '😱', '😓', '😩', '🥱', '👍', '👎', '👌', '✌️', '🤝', '👏',
  '🙌', '🙏', '💪', '👋', '✋', '👉', '👈', '☝️', '❤️', '🧡', '💛', '💚', '💙', '💜', '💯', '🎉',
  '🎊', '🎁', '🏆', '🥇', '⭐', '🌟', '✨', '🔥', '🌸', '🌻', '📚', '📖', '✏️', '📝', '📅', '⏰',
  '🔔', '📢', '📌', '✅', '❌', '❓', '❗', '💡',
];

export default function EmojiPicker({ onPick }) {
  return (
    <div className="chat-emoji-panel" role="menu" aria-label="Chọn biểu tượng" onClick={(e) => e.stopPropagation()}>
      {EMOJI.map((emoji) => (
        <button key={emoji} type="button" role="menuitem" onClick={() => onPick(emoji)} aria-label={emoji}>
          {emoji}
        </button>
      ))}
    </div>
  );
}
