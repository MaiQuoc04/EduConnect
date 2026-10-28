// Username generation (business-rules §3): given name + initials of the family and middle names, no accents.
// "Nguyễn Thế Anh" -> "anhnt". If taken, a number is added: anhnt1, anhnt2…
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

// Picks the first free username for `fullName` (db = pool or a transaction client).
export async function nextFreeUsername(db, fullName) {
  const base = baseUsername(fullName);
  // base only has [a-z0-9], so it is safe inside the regular expression.
  const { rows } = await db.query(
    `SELECT username FROM users WHERE username = $1 OR username ~ ('^' || $1 || '[0-9]+$')`,
    [base],
  );
  const taken = new Set(rows.map((r) => r.username));
  if (!taken.has(base)) return base;
  for (let i = 1; ; i += 1) {
    if (!taken.has(`${base}${i}`)) return `${base}${i}`;
  }
}

// ASSUMPTION: besides "not all digits, no @" (business-rules §3), a username uses only a–z, 0–9, "." and "_",
// 3–50 characters, so it stays easy to type on a phone. Used when System Admin edits a username (UC-96).
export function isValidUsername(username) {
  return typeof username === 'string' && /^[a-z0-9._]{3,50}$/.test(username) && !/^\d+$/.test(username);
}

// Usernames for many new accounts at once (UC-93 preview and import): same rule as nextFreeUsername, also kept
// unique between the names of the list. Returns one username per name, in order.
export async function planUsernames(db, fullNames) {
  const bases = fullNames.map(baseUsername);
  const unique = [...new Set(bases)];
  if (!unique.length) return [];
  const { rows } = await db.query(
    `SELECT username FROM users
     WHERE username = ANY($1::text[]) OR username ~ ANY (SELECT '^' || b || '[0-9]+$' FROM unnest($1::text[]) AS b)`,
    [unique],
  );
  const taken = new Set(rows.map((r) => r.username));
  return bases.map((base) => {
    let name = base;
    for (let i = 1; taken.has(name); i += 1) name = `${base}${i}`;
    taken.add(name);
    return name;
  });
}
