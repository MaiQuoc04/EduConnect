// Username generation (business-rules §3, role formats agreed 01/11/2026). The name part is the given name +
// initials of the family and middle names, no accents: "Nguyễn Thế Anh" -> "anhnt". Then, by role:
//   Student        name + student code in lower case   anhnths0123   (unique because the code is)
//   Teacher        name + teacher code in lower case   anhntgv0042
//   School Manager "sm." + name                         sm.anhnt, sm.anhnt1…
//   Parent         "ph." + name                         ph.anhnt, ph.anhnt1…
//   System Admin   "sa." + name (only `npm run seed:admin`, which takes the username as typed)
// Several roles: Student > Teacher > School Manager > Parent. Existing usernames never change.
// A username is never all digits and never contains "@" (so it cannot be confused with a phone number or email).

export function removeAccents(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function baseUsername(fullName) {
  const words = removeAccents(fullName)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return 'user';
  const given = words.at(-1);
  const initials = words.slice(0, -1).map((w) => w[0]).join('');
  const base = `${given}${initials}`.slice(0, 40);
  return /^\d+$/.test(base) ? `u${base}` : base;
}

// The generated username before any number is added. `account` = { fullName, roles, student?, teacher? }
// (the input of readAccountInput).
export function usernameStem({ fullName, roles = [], student, teacher }) {
  const name = baseUsername(fullName);
  if (roles.includes('STUDENT') && student?.studentCode) return `${name}${student.studentCode.toLowerCase()}`;
  if (roles.includes('TEACHER') && teacher?.teacherCode) return `${name}${teacher.teacherCode.toLowerCase()}`;
  if (roles.includes('SCHOOL_MANAGER')) return `sm.${name}`;
  if (roles.includes('PARENT')) return `ph.${name}`;
  if (roles.includes('SYSTEM_ADMIN')) return `sa.${name}`;
  return name;
}

// "stem" or "stem" + digits, as a PostgreSQL regular expression (a stem only has [a-z0-9.]; the dot is escaped).
const numberedPattern = (stem) => `^${stem.replace(/\./g, '\\.')}[0-9]*$`;

// Picks the first free username for one account (db = pool or a transaction client). Codes are unique, so student and
// teacher usernames are normally free; a number is still added if one is taken.
export async function nextFreeUsername(db, account) {
  const [name] = await planUsernames(db, [account]);
  return name;
}

// Business rules §3 (agreed 01/11/2026): besides "not all digits, no @", a username uses only a–z, 0–9, "." and "_",
// 3–50 characters, so it stays easy to type on a phone. Used when System Admin edits a username (UC-99); an edited
// username does not have to follow the generated format.
export function isValidUsername(username) {
  return typeof username === 'string' && /^[a-z0-9._]{3,50}$/.test(username) && !/^\d+$/.test(username);
}

// Usernames for many new accounts at once (UC-96 preview and import): same rule as nextFreeUsername, also kept
// unique between the accounts of the list. Returns one username per account, in order.
export async function planUsernames(db, accounts) {
  const stems = accounts.map(usernameStem);
  const unique = [...new Set(stems)];
  if (!unique.length) return [];
  const { rows } = await db.query('SELECT username FROM users WHERE username ~ ANY ($1::text[])', [
    unique.map(numberedPattern),
  ]);
  const taken = new Set(rows.map((r) => r.username));
  return stems.map((stem) => {
    let name = stem;
    for (let i = 1; taken.has(name); i += 1) name = `${stem}${i}`;
    taken.add(name);
    return name;
  });
}
