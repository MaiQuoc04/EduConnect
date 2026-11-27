// Unit tests for the automatic content check (moderation phase 1, docs/moderation-plan.md "Kiểm thử và chỉ số").
// Run: npm test (node --test, no extra package). The rules used here are declared in this file on purpose.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { performance } from 'node:perf_hooks';
import { CATEGORIES, buildRuleIndex, checkContent, normalizeText } from './moderation.js';

let nextId = 1;
const rule = (pattern, category, { matchType = 'WORD', accentInsensitive = false, isActive = true, ruleId } = {}) => ({
  ruleId: ruleId ?? nextId++,
  pattern,
  matchType,
  accentInsensitive,
  category,
  isActive,
});

const R = {
  dm: rule('đm', 'INAPPROPRIATE_LANGUAGE', { accentInsensitive: true, ruleId: 2 }),
  vcl: rule('vcl', 'INAPPROPRIATE_LANGUAGE', { accentInsensitive: true, ruleId: 7 }),
  ngu: rule('ngu', 'HARASSMENT', { ruleId: 11 }),
  xong: rule('xong', 'INAPPROPRIATE_LANGUAGE', { ruleId: 12 }), // only to prove "xoong" is not collapsed to it
  cave: rule('cave', 'SEXUAL', { ruleId: 13 }),
  dan: rule('đần', 'HARASSMENT', { ruleId: 14 }), // accent-sensitive: "dan" (dân, dán) must not match
  khonNan: rule('khốn nạn', 'HARASSMENT', { matchType: 'PHRASE', accentInsensitive: true, ruleId: 15 }),
  gietMay: rule('giết mày', 'VIOLENCE', { matchType: 'PHRASE', ruleId: 16 }),
  off: rule('cút', 'HARASSMENT', { isActive: false, ruleId: 17 }),
};
const index = buildRuleIndex(Object.values(R));
const check = (text) => checkContent(text, index);
const assertHit = (text, ruleId) => {
  const result = check(text);
  assert.equal(result.matched, true, `expected a match for ${JSON.stringify(text)}`);
  if (ruleId !== undefined) assert.ok(result.ruleIds.includes(ruleId), `expected rule ${ruleId} for ${JSON.stringify(text)}`);
};
const assertClean = (text) => {
  const result = check(text);
  assert.deepEqual(result, { matched: false, ruleIds: [], category: null }, `unexpected match for ${JSON.stringify(text)}`);
};

describe('normalizeText', () => {
  it('returns tokens and accent-free tokens of the same length and order', () => {
    const { tokens, foldedTokens } = normalizeText('Đi HỌC đúng giờ nhé');
    assert.deepEqual(tokens, ['đi', 'học', 'đúng', 'giờ', 'nhé']);
    assert.deepEqual(foldedTokens, ['di', 'hoc', 'dung', 'gio', 'nhe']);
  });

  it('treats NFD input like NFC', () => {
    assert.deepEqual(normalizeText('Học'.normalize('NFD')).tokens, ['học']);
  });

  it('keeps numbers out and number-only chunks untouched', () => {
    assert.deepEqual(normalizeText('phòng 104').tokens, ['phòng']);
  });
});

describe('checkContent – inserted characters', () => {
  it('glues runs of one-letter words', () => {
    for (const text of ['đ.m', 'đ m', 'd_m', 'Đ . M thật', 'nói thế đ-m-m-m luôn']) assertHit(text, R.dm.ruleId);
  });

  it('does not match a list like "a, b, c" with an unrelated rule', () => {
    assertClean('Chọn đáp án a, b, c hoặc d');
    assertClean('a, b, c');
  });

  it('keeps a lone one-letter word as it is', () => {
    assert.deepEqual(normalizeText('dạ ạ vâng').tokens, ['dạ', 'ạ', 'vâng']);
  });

  it('never glues an accented one-letter word, and lets it end the run', () => {
    assert.deepEqual(normalizeText('đ m à').tokens, ['đm', 'à']);
    assertHit('đ m à', R.dm.ruleId);
    assertHit('nói thế đ m ạ', R.dm.ruleId);
    assert.deepEqual(normalizeText('đ.m').tokens, ['đm']); // "đ" itself still joins
    assert.deepEqual(normalizeText('đ à m').tokens, ['đ', 'à', 'm']);
    assert.deepEqual(normalizeText('ừ ừ ok').tokens, ['ừ', 'ừ', 'ok']);
    assert.deepEqual(normalizeText('à mà mai học gì').tokens, ['à', 'mà', 'mai', 'học', 'gì']);
    assert.deepEqual(normalizeText('ơ, ừ, à, ờ').tokens, ['ơ', 'ừ', 'à', 'ờ']);
    assertClean('ừ ừ ok');
    assertClean('à mà mai học gì');
  });
});

describe('checkContent – repeated letters', () => {
  it('collapses a letter repeated three times or more', () => {
    assertHit('đmmmm', R.dm.ruleId);
    assertHit('vcllll luôn', R.vcl.ruleId);
    assertHit('VCLLLLLL', R.vcl.ruleId);
  });

  it('keeps a letter repeated exactly twice', () => {
    assertClean('Mẹ mua cái xoong mới');
    assert.deepEqual(normalizeText('xoong').tokens, ['xoong']);
  });
});

describe('checkContent – digits used as letters', () => {
  it('replaces look-alike digits inside a chunk that mixes letters and digits', () => {
    assertHit('đồ c4ve', R.cave.ruleId);
    assertHit('C4V3 à', R.cave.ruleId);
    assert.deepEqual(normalizeText('ng@ c4ve').tokens, ['nga', 'cave']);
  });

  it('compares a token with a replaced character against the accent-free form of every rule', () => {
    // "giết mày" and "đần" are accent-sensitive rules, yet whoever swaps digits in cannot type the accents.
    assertHit('Gi3t m4y', R.gietMay.ruleId);
    assertHit('tao gi3t m4y', R.gietMay.ruleId);
    assertHit('gi3t mày', R.gietMay.ruleId); // the unreplaced token keeps its accent-sensitive comparison
    assertHit('giết m4y', R.gietMay.ruleId);
    assertHit('mày đ4n thế', R.dan.ruleId);
    assertHit('m@y ngu', R.ngu.ruleId);
  });

  it('compares a replaced token without accents only when it has 3 characters or more', () => {
    // Accent-sensitive rules whose accent-free forms are what school shorthand turns into: "ta", "ce", "eh", "kio".
    const local = buildRuleIndex([
      rule('tà', 'INAPPROPRIATE_LANGUAGE', { ruleId: 1 }),
      rule('cế', 'INAPPROPRIATE_LANGUAGE', { ruleId: 2 }),
      rule('ếh', 'INAPPROPRIATE_LANGUAGE', { ruleId: 3 }),
      rule('lồn', 'INAPPROPRIATE_LANGUAGE', { ruleId: 4 }),
      rule('địt', 'SEXUAL', { ruleId: 5 }),
      rule('giết mày', 'VIOLENCE', { matchType: 'PHRASE', ruleId: 6 }),
    ]);
    const hit = (text) => checkContent(text, local).ruleIds;
    assert.deepEqual(hit('t4 học bù tiết 3'), []); // "t4" -> "ta": 2 characters
    assert.deepEqual(hit('ôn thi vào c3'), []); // "c3" -> "ce"
    assert.deepEqual(hit('nộp bài trước 23h59'), []); // "23h59" -> "eh"
    assert.deepEqual(hit('l0n'), [4]);
    assert.deepEqual(hit('đ1t'), [5]);
    assert.deepEqual(hit('Gi3t m4y'), [6]);
    assert.deepEqual(hit('tà'), [1]); // typed as is, the exact comparison is unchanged
  });

  it('keeps the old behaviour for tokens without a replacement', () => {
    assertClean('giet may'); // accent-sensitive rule, typed without accents, no digit: not matched
    assertClean('gi3t may'); // "may" had no replacement, so it must still match "mày" with its accent
    assertClean('người dân 4 phương'); // "4" stands alone (number-only chunk): nothing is replaced
    assertClean('dan4'); // "dan4" -> "dana", not "dan"
  });

  it('leaves room and class numbers alone', () => {
    assertClean('Họp ở phòng 104 lúc 14h');
    assertClean('Học sinh lớp 10A1 nộp bài');
    assert.deepEqual(normalizeText('phòng 104').tokens, ['phòng']);
  });
});

describe('checkContent – accents', () => {
  it('matches the accent-free form when accentInsensitive = true', () => {
    assertHit('đồ khốn nạn', R.khonNan.ruleId);
    assertHit('do khon nan', R.khonNan.ruleId);
    assertHit('dm', R.dm.ruleId);
  });

  it('does not match the accent-free form when accentInsensitive = false', () => {
    assertHit('mày đần thế', R.dan.ruleId);
    assertClean('người dân địa phương');
    assertClean('may dan the');
  });
});

describe('checkContent – no substring match', () => {
  it('does not match a harmless word that contains a forbidden word', () => {
    assertHit('mày ngu thế', R.ngu.ruleId);
    assertClean('Nguồn tài liệu ở thư viện');
    assertClean('Bạn ấy là người Nguyễn Văn A');
    assertClean('Em ngủ sớm nhé'); // "ngu" is accent-sensitive
    assertClean('đmx với vclx không phải từ cấm');
  });
});

describe('checkContent – phrases', () => {
  it('matches a phrase in order', () => {
    assertHit('tao giết mày đấy', R.gietMay.ruleId);
    assertHit('Giết... mày!', R.gietMay.ruleId);
  });

  it('does not match scattered or reversed words', () => {
    assertClean('mày giết con muỗi chưa');
    assertClean('giết thời gian cùng mày');
    assertClean('khốn khổ vì nạn kẹt xe');
  });
});

describe('checkContent – category priority', () => {
  it('returns the most severe category', () => {
    const result = check('đm tao giết mày');
    assert.equal(result.matched, true);
    assert.deepEqual(result.ruleIds, [R.dm.ruleId, R.gietMay.ruleId]);
    assert.equal(result.category, 'VIOLENCE');
  });

  it('has no self-harm category', () => {
    assert.deepEqual(CATEGORIES, ['VIOLENCE', 'SEXUAL', 'DISCRIMINATION', 'HARASSMENT', 'INAPPROPRIATE_LANGUAGE']);
    assertClean('Dạo này mệt quá, chán chẳng muốn làm gì');
  });
});

describe('checkContent – inactive rules', () => {
  it('ignores a rule with isActive = false', () => {
    assertClean('cút đi');
  });
});

describe('checkContent – odd input', () => {
  it('never throws and never matches', () => {
    for (const value of [null, undefined, 42, 0, '', '   ', '\n\t', '😀😂🔥', '👍 👍', {}, [], true]) {
      assert.deepEqual(checkContent(value, index), { matched: false, ruleIds: [], category: null });
    }
  });

  it('copes with a missing index or odd rules', () => {
    assert.deepEqual(checkContent('đm', undefined), { matched: false, ruleIds: [], category: null });
    const odd = buildRuleIndex([null, {}, rule('', 'HARASSMENT'), rule('x', 'SELF_HARM'), rule('y', 'HARASSMENT', { matchType: 'REGEX' })]);
    assert.equal(checkContent('x y', odd).matched, false);
    assert.equal(checkContent('x', buildRuleIndex(null)).matched, false);
  });

  it('counts the rules skipped for broken data in index.skipped', () => {
    const odd = buildRuleIndex([
      null, // not a rule
      { pattern: 'abc', matchType: 'WORD', category: 'HARASSMENT' }, // no ruleId
      rule('   ', 'HARASSMENT'), // empty pattern after normalization
      rule('😀', 'HARASSMENT'), // no letters at all
      rule('x', 'SELF_HARM'), // unknown category
      rule('y', 'HARASSMENT', { matchType: 'REGEX' }), // unknown match type
      rule('cút', 'HARASSMENT', { isActive: false }), // inactive: left out, but not broken
      rule('ổn', 'HARASSMENT', { ruleId: 'abc' }), // non-numeric id
      rule('ngu', 'HARASSMENT'), // fine
    ]);
    assert.equal(odd.skipped, 7);
    assert.equal(index.skipped, 0);
    assert.equal(buildRuleIndex(null).skipped, 0);
    assert.equal(buildRuleIndex([]).skipped, 0);
  });
});

describe('checkContent – ruleIds', () => {
  it('returns unique ids in ascending order when a rule matches several times', () => {
    const result = check('vcl vcl đm vcl đ.m');
    assert.deepEqual(result.ruleIds, [2, 7]);
    assert.equal(result.category, 'INAPPROPRIATE_LANGUAGE');
  });
});

describe('checkContent – performance', () => {
  it('checks a 2,000-character message against 500 rules in under 5 ms on average', () => {
    const letters = 'abcdeghiklmnopqrstuvxyđ';
    const randomWord = (seed) => {
      let word = '';
      for (let i = 0; i < 3 + (seed % 5); i += 1) word += letters[(seed * 7 + i * 13) % letters.length];
      return `${word}${seed}`.replace(/\d/g, '') + letters[seed % letters.length];
    };
    const rules = Array.from({ length: 500 }, (_, i) =>
      rule(i % 3 === 0 ? `${randomWord(i)} ${randomWord(i + 1)}` : randomWord(i), CATEGORIES[i % CATEGORIES.length], {
        matchType: i % 3 === 0 ? 'PHRASE' : 'WORD',
        accentInsensitive: i % 2 === 0,
        ruleId: 1000 + i,
      }),
    );
    const bigIndex = buildRuleIndex(rules);
    const base = 'Chiều nay lớp 10A1 học bù môn Toán ở phòng 104, các em nhớ mang máy tính và vở bài tập nhé. ';
    const text = base.repeat(Math.ceil(2000 / base.length)).slice(0, 2000);
    assert.equal(text.length, 2000);

    checkContent(text, bigIndex); // warm up
    const runs = 100;
    const start = performance.now();
    for (let i = 0; i < runs; i += 1) checkContent(text, bigIndex);
    const average = (performance.now() - start) / runs;
    assert.ok(average < 5, `average ${average.toFixed(3)} ms`);
  });
});
