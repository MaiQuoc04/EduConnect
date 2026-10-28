// FE-13 display helpers. Server times look like "2026-10-21 08:30:00.123+07" (Vietnam time).

// "2026-10-21 08:30:00+07" -> "08:30 21/10/2026"
export function formatDateTime(value) {
  if (!value) return '';
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return m ? `${m[4]}:${m[5]} ${m[3]}/${m[2]}/${m[1]}` : String(value);
}

// Server time -> value for <input type="datetime-local"> in the browser's time zone.
export function toLocalInput(value) {
  if (!value) return '';
  const d = new Date(String(value).replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// <input type="datetime-local"> value -> ISO string with time zone for the API.
export function fromLocalInput(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}
