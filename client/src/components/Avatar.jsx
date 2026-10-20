// Profile picture, or the first letter of the given name (the last word of a Vietnamese name).
export default function Avatar({ src, name = '', size = 40, square = false }) {
  const initial = name.trim().split(/\s+/).at(-1)?.[0]?.toUpperCase() ?? '?';
  return (
    <span
      className={`avatar${square ? ' square' : ''}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {src ? <img src={src} alt={name} /> : initial}
    </span>
  );
}
