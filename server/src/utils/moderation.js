// Automatic content check for comments and messages (moderation, phase 1 – see docs/moderation-plan.md,
// "Bộ quy tắc và chuẩn hoá tiếng Việt"). Pure module: no database, no env, no I/O. The caller loads the rules,
// builds the index once with buildRuleIndex() and calls checkContent() for every comment / message.
//
// This module deliberately has NO rule and NO category for self-harm content. Per docs/moderation-plan.md such
// content is never hidden automatically: it only goes through the "Cần được hỗ trợ" (NEEDS_SUPPORT) report flow,
// so a cry for help is never removed before anyone can answer it.
//
// Matching is by whole token (WORD) or by a run of consecutive tokens (PHRASE), never by substring: a short
// forbidden word sits inside many harmless words, and substring matching is the biggest source of false hits.

import { foldVietnamese } from './search.js';

// Priority when one content matches several categories: most severe first.
export const CATEGORIES = ['VIOLENCE', 'SEXUAL', 'DISCRIMINATION', 'HARASSMENT', 'INAPPROPRIATE_LANGUAGE'];

const MATCH_TYPES = new Set(['WORD', 'PHRASE']);

// Look-alike characters, replaced only inside a chunk that mixes letters with [0-9@] ("đ1t" -> "đit").
const LOOKALIKES = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', '@': 'a' };
const HAS_LETTER = /\p{L}/u;
const HAS_LOOKALIKE = /[0-9@]/;
const LOOKALIKE_CHARS = /[0134@]/g;
const WORD = /[\p{L}\p{M}]+/gu;
// A letter repeated 3+ times in a row ("đmmmm"); exactly 2 is kept (real words such as "xoong").
const REPEATED_LETTER = /(\p{L})\1{2,}/gu;
// A token with a replaced look-alike is compared with the accent-free form of every rule only from this length on:
// "l0n", "m4y", "gi3t" are, while school shorthand such as "t4" (-> "ta"), "c3" (-> "ce"), "23h59" (-> "eh") is not.
const MIN_SUBSTITUTED_LENGTH = 3;

// A one-letter word with an accent ("à", "ừ", "ạ") is a real word, not an inserted letter: it never joins a run of
// one-letter words and it ends the current run ("đ m à" -> "đm", "à"). "đ" is the exception: it is how "đm" is typed.
function isAccentedSingle(word) {
  return word !== 'đ' && foldVietnamese(word) !== word;
}

// Full normalization; substituted[i] tells whether token i had at least one look-alike character replaced and is
// at least MIN_SUBSTITUTED_LENGTH characters long (a shorter one is treated like any other token).
function normalize(text) {
  if (typeof text !== 'string' || !text.trim()) return { tokens: [], foldedTokens: [], substituted: [] };

  // 1. NFC (two keyboards give the same string) and lower case.
  const lower = text.normalize('NFC').toLowerCase();

  // 2 + 3. Per whitespace chunk: look-alike digits / "@" become letters only when the chunk also has a letter
  //    ("104" stays a number and is then dropped as a boundary). Then words = runs of letters (+ combining marks);
  //    digits, punctuation, emoji are boundaries. Every replacement is one character for one character, so the
  //    offsets of the replaced characters stay valid and tell which words were touched.
  const words = [];
  for (const chunk of lower.split(/\s+/)) {
    if (!chunk) continue;
    let replaced = chunk;
    let replacedAt = null;
    if (HAS_LETTER.test(chunk) && HAS_LOOKALIKE.test(chunk)) {
      replacedAt = new Set();
      replaced = chunk.replace(LOOKALIKE_CHARS, (c, offset) => {
        replacedAt.add(offset);
        return LOOKALIKES[c];
      });
    }
    for (const m of replaced.matchAll(WORD)) {
      let touched = false;
      if (replacedAt) {
        for (let k = m.index; k < m.index + m[0].length && !touched; k += 1) touched = replacedAt.has(k);
      }
      words.push({ word: m[0], touched });
    }
  }

  // 4. Two or more consecutive one-letter words without an accent are glued into one word: "đ.m", "đ m",
  //    "d_m" -> "đm". A lone one-letter word, or an accented one ("à"), stays as it is.
  const glued = [];
  let run = [];
  const flush = () => {
    if (run.length >= 2) glued.push({ word: run.map((w) => w.word).join(''), touched: run.some((w) => w.touched) });
    else if (run.length === 1) glued.push(run[0]);
    run = [];
  };
  for (const item of words) {
    if ([...item.word].length === 1 && !isAccentedSingle(item.word)) {
      run.push(item);
    } else {
      flush();
      glued.push(item);
    }
  }
  flush();

  // 5. A letter repeated 3+ times collapses to one: "đmmmm" -> "đm", "vcllll" -> "vcl".
  const tokens = glued.map((item) => item.word.replace(REPEATED_LETTER, '$1'));

  // 6. Accent-free copy, with the same fold the list searches use.
  return {
    tokens,
    foldedTokens: tokens.map((token) => foldVietnamese(token)),
    substituted: glued.map((item, i) => item.touched && [...tokens[i]].length >= MIN_SUBSTITUTED_LENGTH),
  };
}

/**
 * text -> { tokens, foldedTokens }. tokens keep the accents; foldedTokens are the same tokens without accents
 * (same length, same order). Never throws: anything that is not a non-blank string gives no tokens.
 */
export function normalizeText(text) {
  const { tokens, foldedTokens } = normalize(text);
  return { tokens, foldedTokens };
}

function emptySide() {
  return { words: new Map(), phrases: new Map() };
}

function addTo(map, key, value) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * rules: [{ ruleId, pattern, matchType: 'WORD'|'PHRASE', accentInsensitive, category, isActive }].
 * Inactive rules are skipped. Patterns go through normalizeText itself, so "đ m" in a pattern also becomes "đm".
 * Returns an index of Maps: WORD rules keyed by token, PHRASE rules keyed by their first token.
 *   exact       – accent-sensitive rules, compared with the tokens as typed;
 *   folded      – accentInsensitive rules, compared with the accent-free tokens;
 *   substituted – the accent-sensitive rules again, keyed by their accent-free form, used only for tokens that had
 *                 a look-alike replaced: someone typing "gi3t m4y" to dodge the filter cannot type the accents.
 *   skipped     – number of rules left out because their data is broken (inactive rules are not counted), so the
 *                 caller can log it when it loads the rules.
 */
export function buildRuleIndex(rules) {
  const index = { exact: emptySide(), folded: emptySide(), substituted: emptySide(), skipped: 0 };
  if (!Array.isArray(rules)) return index;

  for (const rule of rules) {
    if (rule && rule.isActive === false) continue;
    // ASSUMPTION: a rule with an unknown category or match type, a non-numeric id or an empty pattern is skipped
    // instead of throwing, so one bad row never stops every comment and message from being checked.
    if (!rule) {
      index.skipped += 1;
      continue;
    }
    const ruleId = Number(rule.ruleId);
    const rank = CATEGORIES.indexOf(rule.category);
    if (rule.ruleId == null || !Number.isFinite(ruleId) || rank < 0 || !MATCH_TYPES.has(rule.matchType)) {
      index.skipped += 1;
      continue;
    }

    const { tokens, foldedTokens } = normalizeText(rule.pattern);
    if (!tokens.length) {
      index.skipped += 1;
      continue;
    }

    // ASSUMPTION: a WORD pattern that normalizes to several tokens (e.g. "đ m x") is matched like a PHRASE,
    // i.e. as consecutive whole tokens – still never as a substring.
    const isWord = rule.matchType === 'WORD' && tokens.length === 1;

    if (rule.accentInsensitive === true) {
      // Already compared without accents on every token, so it needs no entry in `substituted`.
      if (isWord) addTo(index.folded.words, foldedTokens[0], { ruleId, rank });
      else addTo(index.folded.phrases, foldedTokens[0], { ruleId, rank, tokens: foldedTokens });
    } else if (isWord) {
      addTo(index.exact.words, tokens[0], { ruleId, rank });
      addTo(index.substituted.words, foldedTokens[0], { ruleId, rank });
    } else {
      addTo(index.exact.phrases, tokens[0], { ruleId, rank, tokens });
      addTo(index.substituted.phrases, foldedTokens[0], { ruleId, rank, tokens, foldedTokens });
    }
  }
  return index;
}

function scan(side, tokens, hits) {
  if (!side.words.size && !side.phrases.size) return;
  for (let i = 0; i < tokens.length; i += 1) {
    const words = side.words.get(tokens[i]);
    if (words) for (const entry of words) hits.set(entry.ruleId, entry.rank);

    const phrases = side.phrases.get(tokens[i]);
    if (!phrases) continue;
    for (const phrase of phrases) {
      const length = phrase.tokens.length;
      if (i + length > tokens.length) continue;
      let ok = true;
      for (let k = 1; k < length; k += 1) {
        if (tokens[i + k] !== phrase.tokens[k]) {
          ok = false;
          break;
        }
      }
      if (ok) hits.set(phrase.ruleId, phrase.rank);
    }
  }
}

// Accent-sensitive rules against tokens that had a look-alike replaced: such a token is compared without accents,
// every other token keeps the accent-sensitive comparison. A phrase needs at least one replaced token in its span
// (a span without one is already covered by the exact scan). Tokens with no replacement behave as before.
function scanSubstituted(side, tokens, foldedTokens, substituted, hits) {
  if (!side || (!side.words.size && !side.phrases.size) || !substituted.includes(true)) return;
  for (let i = 0; i < tokens.length; i += 1) {
    if (substituted[i]) {
      const words = side.words.get(foldedTokens[i]);
      if (words) for (const entry of words) hits.set(entry.ruleId, entry.rank);
    }

    // Keyed by the accent-free first token: an exactly equal first token also has the same accent-free form.
    const phrases = side.phrases.get(foldedTokens[i]);
    if (!phrases) continue;
    for (const phrase of phrases) {
      const length = phrase.tokens.length;
      if (i + length > tokens.length) continue;
      let ok = true;
      let anyReplaced = false;
      for (let k = 0; k < length; k += 1) {
        const j = i + k;
        const same = substituted[j] ? foldedTokens[j] === phrase.foldedTokens[k] : tokens[j] === phrase.tokens[k];
        if (!same) {
          ok = false;
          break;
        }
        if (substituted[j]) anyReplaced = true;
      }
      if (ok && anyReplaced) hits.set(phrase.ruleId, phrase.rank);
    }
  }
}

/**
 * text + index (from buildRuleIndex) -> { matched, ruleIds (unique, ascending), category | null }.
 * category is the most severe category (first in CATEGORIES) among the matched rules. Never throws on odd input.
 */
export function checkContent(text, index) {
  const result = { matched: false, ruleIds: [], category: null };
  if (!index || !index.exact || !index.folded) return result;

  const { tokens, foldedTokens, substituted } = normalize(text);
  if (!tokens.length) return result;

  const hits = new Map(); // ruleId -> category rank
  scan(index.exact, tokens, hits);
  scan(index.folded, foldedTokens, hits);
  scanSubstituted(index.substituted, tokens, foldedTokens, substituted, hits);
  if (!hits.size) return result;

  let best = CATEGORIES.length;
  for (const rank of hits.values()) if (rank < best) best = rank;
  return {
    matched: true,
    ruleIds: [...hits.keys()].sort((a, b) => a - b),
    category: CATEGORIES[best],
  };
}

// Regional slurs are only ever PHRASEs ("lũ nam kỳ"): the bare region name is history lessons and street names
// ("khởi nghĩa Nam Kỳ", "đường Nam Kỳ Khởi Nghĩa"). Compared without accents after the same normalization as the
// text, so "Nam  Kỳ", "nam ky" or "n.a.m kỳ" are refused too.
const BARE_REGION_NAMES = new Set(['bac ky', 'trung ky', 'nam ky']);

/**
 * True when a rule pattern is only a region name (Bắc Kỳ / Trung Kỳ / Nam Kỳ) – never allowed as a rule. Shared by
 * scripts/moderation/build-seed.js and the School Manager's rule editor (modules/moderation).
 * @param {string} pattern
 */
export function isBareRegionName(pattern) {
  const { foldedTokens } = normalizeText(pattern);
  return BARE_REGION_NAMES.has(foldedTokens.join(' '));
}
