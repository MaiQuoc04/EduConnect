import { pool } from '../config/db.js';
import { buildRuleIndex } from './moderation.js';
import { createModerationCache } from './moderationCache.js';
import { getSetting } from './settings.js';

// In-memory copy of the moderation rules and the on / off switch (moderation, docs/moderation-plan.md "Nạp quy tắc
// vào bộ nhớ"). The rules are read once and kept: a comment of a few dozen words is a few dozen Map lookups, far less
// than the write to the database itself, and 'moderation.enabled' is not queried on every send.
//
// NOTHING here makes a request wait for the database (utils/moderationCache.js): callers check the text while they
// hold a pooled connection inside a transaction, so waiting for a load that needs a connection too could hang the
// server. The copy is served as it is; a copy older than 5 minutes is reloaded in the background; before the first
// load has worked the check is off. The first load starts as soon as this module is imported (server start).
// invalidateModerationCache() (phase 6: the School Manager edits a rule) reloads in the background too.

const RULES_SQL = `SELECT rule_id AS "ruleId", pattern, match_type AS "matchType",
                          accent_insensitive AS "accentInsensitive", category, is_active AS "isActive"
                   FROM moderation_rules
                   WHERE deleted_at IS NULL`;

// ASSUMPTION: a missing 'moderation.enabled' row means ON – the patch always inserts it ('true'); only the exact
// value 'true' (any case, spaces ignored) counts as on when the row exists.
async function loadFromDatabase() {
  const { rows } = await pool.query(RULES_SQL);
  const enabled = String(await getSetting('moderation.enabled', 'true')).trim().toLowerCase() === 'true';
  const index = buildRuleIndex(rows);
  // Group posts blocked when posted (27/11/2026): the author is told which words to change – the patterns of the
  // matched rules, read from this copy (never a query, never stored with the post).
  index.patterns = new Map(rows.map((r) => [Number(r.ruleId), r.pattern]));
  if (index.skipped > 0) {
    // Never the patterns themselves: the log must not become a list of the words being filtered.
    console.warn(`[moderation] ${index.skipped} moderation rule(s) skipped because their data is invalid`);
  }
  return { enabled, index };
}

const cache = createModerationCache({ load: loadFromDatabase });
cache.start(); // server start: do not wait for the first comment

/**
 * The current switch and rule index: { enabled, index }. Answers at once with the copy in memory (never waits for the
 * database); { enabled: false, index: null } until the first load has worked. Never throws.
 */
export async function getModeration() {
  return cache.get();
}

/** The next check uses fresh rules as soon as they are read; until then the current copy keeps serving (phase 6). */
export function invalidateModerationCache() {
  cache.invalidate();
}

/**
 * invalidateModerationCache() and wait for the new copy (phase 6, the School Manager's rule edits): the answer of a
 * rule edit comes once the change is in force, so a comment sent right after it is checked with it. Only for a request
 * that holds NO connection (never inside a transaction): it waits for one load. Never throws (a failed load is logged
 * by the cache and the previous copy keeps serving).
 */
export async function refreshModerationRules() {
  cache.invalidate();
  await cache.pending();
}

/**
 * Checks a text against the current rules: { hidden, category, ruleIds }. Never throws and never waits for the
 * database – any error is logged and the text is let through (hidden false), so a broken filter never stops a comment
 * or a message from being saved (utils/moderationCache.js moderate).
 * @param {string} text
 * @returns {Promise<{ hidden: boolean, category: string | null, ruleIds: number[] }>}
 */
export async function moderateText(text) {
  return cache.moderate(text);
}

/**
 * Group posts (FE-05) blocked when posted (FE-08 Anh, 27/11/2026): what the AUTHOR of a BLOCKED post is told –
 * { category, terms } checked again with the current rules (nothing is stored with the post). terms are the patterns
 * of the matched rules. Rules changed since and nothing matches any more → { category: null, terms: [] }. Never waits
 * for the database, never throws.
 * @param {string} text
 * @returns {Promise<{ category: string | null, terms: string[] }>}
 */
export async function moderationTermsOf(text) {
  const check = await moderateText(text);
  if (!check.hidden) return { category: null, terms: [] };
  const { index } = await getModeration();
  const terms = check.ruleIds.map((id) => index?.patterns?.get(id)).filter(Boolean);
  return { category: check.category, terms: [...new Set(terms)] };
}
