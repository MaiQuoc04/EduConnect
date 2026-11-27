// Generates database/seed_moderation_rules.sql from scripts/moderation/rules.sample.json (moderation phase 2,
// docs/moderation-plan.md "Dữ liệu khởi tạo"). No database: it only reads the JSON and writes the SQL file.
// Run in server/: node scripts/moderation/build-seed.js
// The JSON is the source of truth: change the rules there, run eval.js (0 false positives), then run this script.
import { readFileSync, writeFileSync } from 'node:fs';
import { CATEGORIES, buildRuleIndex, isBareRegionName } from '../../src/utils/moderation.js';

const SOURCE = new URL('./rules.sample.json', import.meta.url);
const TARGET = new URL('../../../database/seed_moderation_rules.sql', import.meta.url);
const MATCH_TYPES = ['WORD', 'PHRASE'];

const rules = JSON.parse(readFileSync(SOURCE, 'utf8'));
const errors = [];
if (!Array.isArray(rules) || !rules.length) errors.push('rules.sample.json must be a non-empty array');

const seen = new Set();
for (const [i, rule] of (Array.isArray(rules) ? rules : []).entries()) {
  const where = `rule #${i + 1} (${JSON.stringify(rule?.pattern)})`;
  const { pattern, matchType, accentInsensitive, category, isActive } = rule ?? {};
  if (typeof pattern !== 'string' || !pattern.trim()) {
    errors.push(`${where}: pattern must be a non-empty string`);
    continue;
  }
  // Stored as typed (lower case, accents kept), like the rows the School Manager will add (moderation_rules.pattern).
  if (pattern !== pattern.normalize('NFC').toLowerCase().trim().replace(/\s+/g, ' ')) {
    errors.push(`${where}: pattern must be NFC, lower case, single spaces, no leading / trailing space`);
  }
  if ([...pattern].length > 100) errors.push(`${where}: pattern is longer than VARCHAR(100)`);
  if (seen.has(pattern)) errors.push(`${where}: duplicate pattern (moderation_rules_pattern_key)`);
  seen.add(pattern);
  if (!MATCH_TYPES.includes(matchType)) errors.push(`${where}: matchType must be WORD or PHRASE`);
  if (!CATEGORIES.includes(category)) errors.push(`${where}: category must be one of ${CATEGORIES.join(', ')}`);
  if (typeof accentInsensitive !== 'boolean') errors.push(`${where}: accentInsensitive must be true or false`);
  if (typeof isActive !== 'boolean') errors.push(`${where}: isActive must be true or false`);
  // Regional slurs are only ever PHRASEs ("lũ nam kỳ"): utils/moderation.js isBareRegionName.
  if (isBareRegionName(pattern)) errors.push(`${where}: a region name alone is never a rule, use a PHRASE`);
}
// Same check the server will run when it loads the rules: nothing may be skipped as broken.
if (!errors.length) {
  const { skipped } = buildRuleIndex(rules);
  if (skipped) errors.push(`${skipped} rule(s) would be skipped by buildRuleIndex`);
}
if (errors.length) {
  console.error(`rules.sample.json is not valid, nothing written:\n  ${errors.join('\n  ')}`);
  process.exit(1);
}

const literal = (text) => `'${text.replace(/'/g, "''")}'`;
const bool = (value) => (value ? 'TRUE' : 'FALSE');
const width = Math.max(...rules.map((r) => literal(r.pattern).length));
const values = rules.map(
  (r) =>
    `  (${`${literal(r.pattern)},`.padEnd(width + 1)} ${`'${r.matchType}',`.padEnd(9)} ${`${bool(r.accentInsensitive)},`.padEnd(6)} ` +
    `${`'${r.category}',`.padEnd(25)} ${bool(r.isActive)})`,
);

const count = (category) => rules.filter((r) => r.category === category).length;
const sql = `-- GENERATED FILE – do not edit by hand. Source: server/scripts/moderation/rules.sample.json.
-- Regenerate (in server/): node scripts/moderation/build-seed.js   (check first: node scripts/moderation/eval.js)
-- First rules of the automatic content check (moderation, docs/moderation-plan.md "Bộ quy tắc và chuẩn hoá tiếng
-- Việt"): ${rules.length} rules – ${CATEGORIES.map((c) => `${c} ${count(c)}`).join(', ')}.
-- No rule for self-harm content, ever: it only goes through the NEEDS_SUPPORT report.
-- pattern is stored as typed (lower case, accents kept); the server normalizes it the same way as the text it checks.
-- rule_id comes from the database, not from the JSON file.
-- Needs patch_v0.3_moderation.sql first. How to run: Supabase > SQL Editor > paste > Run. Safe to run again: a pattern
-- that already exists (and is not deleted) is left as it is, so the School Manager's changes are never overwritten.

BEGIN;

INSERT INTO moderation_rules (pattern, match_type, accent_insensitive, category, is_active) VALUES
${values.join(',\n')}
ON CONFLICT (pattern) WHERE deleted_at IS NULL DO NOTHING;

COMMIT;
`;

writeFileSync(TARGET, sql);
console.log(`Wrote database/seed_moderation_rules.sql (${rules.length} rules).`);
