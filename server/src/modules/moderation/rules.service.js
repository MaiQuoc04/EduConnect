import { pool, withTransaction } from '../../config/db.js';
import { AppError, badRequest, forbidden, notFound } from '../../utils/AppError.js';
import { logActivity } from '../../utils/activityLog.js';
import { CATEGORIES, buildRuleIndex, checkContent, isBareRegionName, normalizeText } from '../../utils/moderation.js';
import { refreshModerationRules } from '../../utils/moderationRules.js';

// Moderation phase 6 (FE-08, owner Anh, 25/11/2026) – tab "Quy tắc" of the "Quy chuẩn cộng đồng" screen: the School
// Manager adds, edits, turns off and deletes (soft) the rules of the automatic check, sees how often each one matched
// and how often its matches were unhidden (a high rate = a rule that hides innocent content), and tries a sentence.
// Every write is in force at once: the answer waits for the new copy of the rules (refreshModerationRules) and is
// logged (MODERATION_RULE_CHANGE { ruleId, change }).

export const MATCH_TYPES = Object.freeze(['WORD', 'PHRASE']);
const MAX_PATTERN_LENGTH = 100; // moderation_rules.pattern VARCHAR(100)
const MIN_FOLDED_LENGTH = 3; // accent-free matching on a shorter pattern hits ordinary words
const MAX_TEST_LENGTH = 2000; // as a chat message / comment

const invalid = (field) => badRequest('MSG_INVALID_PARAM', `Invalid value for "${field}".`, { field });
const ruleNotFound = () => notFound('MSG_RULE_NOT_FOUND', 'Rule not found.');
const duplicate = () => new AppError(409, 'MSG_RULE_DUPLICATE', 'A rule with this pattern already exists.');

function assertManager(user) {
  if (user?.activeRole !== 'SCHOOL_MANAGER') throw forbidden();
}

const RULE_FIELDS = `r.rule_id AS "ruleId", r.pattern, r.match_type AS "matchType",
  r.accent_insensitive AS "accentInsensitive", r.category, r.is_active AS "isActive",
  r.created_at AS "createdAt", r.updated_at AS "updatedAt"`;

/**
 * GET /moderation/rules?from=&to= – every rule not deleted, with matchCount (violations of source AUTO whose rule_ids
 * contain it, created in the window, whatever their status) and unhideCount (those of them later UNHIDDEN). Default
 * window: the last 30 days. Order: category (most severe first), then pattern.
 * ASSUMPTION: both counts use the violation's created_at for the window (when the rule matched), not when it was unhidden.
 */
export async function listRules(user, { from = null, to = null } = {}) {
  assertManager(user);
  const { rows } = await pool.query(
    `WITH w AS (SELECT COALESCE($1::date, CURRENT_DATE - 29) AS f, COALESCE($2::date, CURRENT_DATE) AS t),
     hits AS (
       SELECT x.rule_id, COUNT(*) AS match_count, COUNT(*) FILTER (WHERE v.status = 'UNHIDDEN') AS unhide_count
       FROM moderation_violations v CROSS JOIN w CROSS JOIN LATERAL unnest(v.rule_ids) AS x(rule_id)
       WHERE v.source = 'AUTO' AND v.created_at >= w.f AND v.created_at < w.t + 1
       GROUP BY x.rule_id)
     SELECT ${RULE_FIELDS}, COALESCE(h.match_count, 0) AS "matchCount", COALESCE(h.unhide_count, 0) AS "unhideCount"
     FROM moderation_rules r
     LEFT JOIN hits h ON h.rule_id = r.rule_id
     WHERE r.deleted_at IS NULL
     ORDER BY array_position($3::text[], r.category::text), r.pattern`,
    [from, to, CATEGORIES],
  );
  const { rows: w } = await pool.query(
    'SELECT COALESCE($1::date, CURRENT_DATE - 29)::text AS "from", COALESCE($2::date, CURRENT_DATE)::text AS "to"',
    [from, to],
  );
  return { ...w[0], items: rows };
}

/**
 * The checked fields of a rule. pattern: NFC, lower case, trimmed, inner spaces collapsed, 1–100 characters, with at
 * least one letter; never a bare region name (400 MSG_RULE_REGION_NAME, the same check as build-seed.js);
 * accentInsensitive only when the accent-free form has at least 3 letters (400 MSG_RULE_TOO_SHORT). category: one of
 * the 5 categories of the rules; matchType: WORD | PHRASE; booleans must be booleans. `partial` (PATCH): only the
 * fields given are checked, against the current values for the cross-field rules.
 */
function parseRule(body, { partial = false, current = null } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('body');
  const allowed = ['pattern', 'matchType', 'accentInsensitive', 'category', 'isActive'];
  const extra = Object.keys(body).find((key) => !allowed.includes(key));
  if (extra) throw invalid(extra);
  const out = {};
  if (!partial || body.pattern !== undefined) {
    if (typeof body.pattern !== 'string') throw badRequest('MSG_REQUIRED', 'Please enter a word or phrase.', { field: 'pattern' });
    const pattern = body.pattern.normalize('NFC').toLowerCase().trim().replace(/\s+/g, ' ');
    if (!pattern) throw badRequest('MSG_REQUIRED', 'Please enter a word or phrase.', { field: 'pattern' });
    if ([...pattern].length > MAX_PATTERN_LENGTH || !normalizeText(pattern).tokens.length) throw invalid('pattern');
    out.pattern = pattern;
  }
  if (!partial || body.matchType !== undefined) {
    if (!MATCH_TYPES.includes(body.matchType)) throw invalid('matchType');
    out.matchType = body.matchType;
  }
  if (!partial || body.category !== undefined) {
    if (!CATEGORIES.includes(body.category)) throw invalid('category');
    out.category = body.category;
  }
  for (const field of ['accentInsensitive', 'isActive']) {
    if (body[field] !== undefined && typeof body[field] !== 'boolean') throw invalid(field);
    if (body[field] !== undefined) out[field] = body[field];
  }
  if (!partial) {
    out.accentInsensitive ??= false;
    out.isActive ??= true;
  }
  const pattern = out.pattern ?? current?.pattern;
  const accentInsensitive = out.accentInsensitive ?? current?.accentInsensitive ?? false;
  if (out.pattern !== undefined && isBareRegionName(pattern)) {
    throw badRequest('MSG_RULE_REGION_NAME', 'A region name alone cannot be a rule; use a phrase.', { field: 'pattern' });
  }
  if (accentInsensitive && normalizeText(pattern).foldedTokens.join('').length < MIN_FOLDED_LENGTH) {
    throw badRequest('MSG_RULE_TOO_SHORT', 'Accent-free matching needs at least 3 letters.', { field: 'accentInsensitive' });
  }
  return out;
}

// After a write: the new rules are in force before the answer, and the change is logged.
async function afterWrite(user, ruleId, change) {
  await refreshModerationRules();
  await logActivity({
    userId: user.userId,
    action: 'MODERATION_RULE_CHANGE',
    targetType: 'MODERATION_RULE',
    targetId: ruleId,
    detail: { ruleId, change },
  });
}

async function liveDuplicate(client, pattern, exceptId = null) {
  const { rows } = await client.query(
    'SELECT 1 FROM moderation_rules WHERE pattern = $1 AND deleted_at IS NULL AND ($2::bigint IS NULL OR rule_id <> $2) LIMIT 1',
    [pattern, exceptId],
  );
  return rows.length > 0;
}

/** POST /moderation/rules – a new rule (409 MSG_RULE_DUPLICATE when the same pattern is live). */
export async function createRule(user, body) {
  assertManager(user);
  const rule = parseRule(body);
  const created = await withTransaction(async (client) => {
    if (await liveDuplicate(client, rule.pattern)) throw duplicate();
    const { rows } = await client.query(
      `INSERT INTO moderation_rules (pattern, match_type, accent_insensitive, category, is_active, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING rule_id AS "ruleId"`,
      [rule.pattern, rule.matchType, rule.accentInsensitive, rule.category, rule.isActive, user.userId],
    ).catch((err) => {
      if (err.code === '23505') throw duplicate(); // two School Managers adding the same pattern together
      throw err;
    });
    return rows[0];
  });
  await afterWrite(user, created.ruleId, { op: 'CREATE', ...rule });
  return getRule(created.ruleId);
}

async function getRule(ruleId) {
  const { rows } = await pool.query(`SELECT ${RULE_FIELDS} FROM moderation_rules r WHERE r.rule_id = $1`, [ruleId]);
  return rows[0];
}

/** PATCH /moderation/rules/:id – change some fields (turn off = { isActive: false }). Only what changed is logged. */
export async function updateRule(user, ruleId, body) {
  assertManager(user);
  const change = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT ${RULE_FIELDS} FROM moderation_rules r WHERE r.rule_id = $1 AND r.deleted_at IS NULL FOR UPDATE`,
      [ruleId],
    );
    const current = rows[0];
    if (!current) throw ruleNotFound();
    const fields = parseRule(body, { partial: true, current });
    const changed = Object.fromEntries(Object.entries(fields).filter(([key, value]) => current[key] !== value));
    if (!Object.keys(changed).length) return null;
    if (changed.pattern !== undefined && (await liveDuplicate(client, changed.pattern, ruleId))) throw duplicate();
    const next = { ...current, ...changed };
    await client.query(
      `UPDATE moderation_rules SET pattern = $2, match_type = $3, accent_insensitive = $4, category = $5, is_active = $6,
              updated_by = $7, updated_at = NOW()
       WHERE rule_id = $1`,
      [ruleId, next.pattern, next.matchType, next.accentInsensitive, next.category, next.isActive, user.userId],
    ).catch((err) => {
      if (err.code === '23505') throw duplicate();
      throw err;
    });
    return Object.fromEntries(Object.entries(changed).map(([key, value]) => [key, { from: current[key], to: value }]));
  });
  if (change) await afterWrite(user, ruleId, { op: 'UPDATE', ...change });
  return getRule(ruleId);
}

/** DELETE /moderation/rules/:id – soft delete (business-rules §14). Violations keep their rule_ids. */
export async function deleteRule(user, ruleId) {
  assertManager(user);
  const { rows } = await pool.query(
    `UPDATE moderation_rules SET deleted_at = NOW(), updated_by = $2, updated_at = NOW()
     WHERE rule_id = $1 AND deleted_at IS NULL
     RETURNING pattern`,
    [ruleId, user.userId],
  );
  if (!rows.length) throw ruleNotFound();
  await afterWrite(user, ruleId, { op: 'DELETE', pattern: rows[0].pattern });
  return { ruleId, deleted: true };
}

/**
 * POST /moderation/rules/test { text } – runs the check on a sentence with the rules as they are in the database now
 * (active, not deleted), whatever the on / off switch says. Writes nothing.
 */
export async function testRules(user, body) {
  assertManager(user);
  const text = typeof body?.text === 'string' ? body.text.normalize('NFC') : null;
  if (!text || !text.trim()) throw badRequest('MSG_REQUIRED', 'Please type a sentence.', { field: 'text' });
  if ([...text].length > MAX_TEST_LENGTH) throw invalid('text');
  const { rows } = await pool.query(
    `SELECT rule_id AS "ruleId", pattern, match_type AS "matchType", accent_insensitive AS "accentInsensitive",
            category, is_active AS "isActive"
     FROM moderation_rules WHERE deleted_at IS NULL`,
  );
  const result = checkContent(text, buildRuleIndex(rows));
  const byId = new Map(rows.map((r) => [r.ruleId, r]));
  return {
    matched: result.matched,
    category: result.category,
    rules: result.ruleIds.map((id) => {
      const { ruleId, pattern, matchType, category } = byId.get(id);
      return { ruleId, pattern, matchType, category };
    }),
  };
}
