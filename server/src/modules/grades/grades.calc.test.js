// Unit tests for the FE-11 grade calculations (Report 2: mandatory for grade calculation and locking).
// Run: npm test (node --test, no extra package).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  academicLevel,
  missingSlots,
  parseScore,
  roundScore,
  semesterAverage,
  yearAverage,
} from './grades.calc.js';

// Circular 22 structure: regular tests ×1 (4 scores), mid-term ×2, final ×3. Weights arrive as NUMERIC strings.
const C22 = [
  { componentId: 1, weight: '1.00', scoreCount: 4 },
  { componentId: 2, weight: '2.00', scoreCount: 1 },
  { componentId: 3, weight: '3.00', scoreCount: 1 },
];
const score = (componentId, attemptNo, value) => ({ componentId, attemptNo, score: value });

describe('semesterAverage', () => {
  it('matches the Circular 22 formula when every score is present', () => {
    const scores = [score(1, 1, '8.00'), score(1, 2, '7.00'), score(1, 3, '9.00'), score(1, 4, '6.00'), score(2, 1, '7.50'), score(3, 1, '8.00')];
    // (8 + 7 + 9 + 6 + 2×7.5 + 3×8) / (4 + 2 + 3) = 69 / 9
    assert.equal(semesterAverage(C22, scores), 69 / 9);
    assert.equal(roundScore(semesterAverage(C22, scores)), 7.7);
  });

  it('uses only the scores present (missing columns)', () => {
    const scores = [score(1, 1, '8'), score(2, 1, '6')];
    assert.equal(semesterAverage(C22, scores), (8 + 12) / 3);
  });

  it('ignores cleared scores (NULL) and scores of components not in the structure', () => {
    const scores = [score(1, 1, '10'), score(1, 2, null), score(99, 1, '0')];
    assert.equal(semesterAverage(C22, scores), 10);
  });

  it('is null without any score', () => {
    assert.equal(semesterAverage(C22, []), null);
    assert.equal(semesterAverage(C22, [score(1, 1, null)]), null);
  });

  it('follows changed weights', () => {
    const changed = C22.map((c) => (c.componentId === 3 ? { ...c, weight: '4' } : c));
    const scores = [score(1, 1, '6'), score(3, 1, '10')];
    assert.equal(semesterAverage(changed, scores), (6 + 40) / 5);
  });

  it('counts a score of 0', () => {
    assert.equal(semesterAverage(C22, [score(1, 1, '0'), score(1, 2, '10')]), 5);
  });
});

describe('yearAverage', () => {
  it('is (S1 + 2 × S2) / 3', () => {
    assert.equal(yearAverage(6, 9), 8);
    assert.equal(roundScore(yearAverage(7.25, 8.1)), 7.8); // 7.8166…
  });
  it('is null while a semester has no average', () => {
    assert.equal(yearAverage(8, null), null);
    assert.equal(yearAverage(null, 8), null);
  });
});

describe('academicLevel (Circular 22, Article 9)', () => {
  const eight = (first, rest) => [...first, ...Array(8 - first.length).fill(rest)];
  it('GOOD: every subject >= 6.5 and at least 6 subjects >= 8.0', () => {
    assert.equal(academicLevel(eight([8, 8, 8, 8, 8, 8], 6.5)), 'GOOD');
    assert.equal(academicLevel(eight([8, 8, 8, 8, 8, 7.9], 9)), 'GOOD'); // 7 subjects >= 8.0
    assert.equal(academicLevel(eight([8, 8, 8, 8, 8], 7.9)), 'FAIR'); // only 5 subjects >= 8.0
    assert.equal(academicLevel(eight([10, 10, 10, 10, 10, 10, 10], 6.4)), 'FAIR'); // one subject below 6.5
  });
  it('FAIR: every subject >= 5.0 and at least 6 subjects >= 6.5', () => {
    assert.equal(academicLevel(eight([6.5, 6.5, 6.5, 6.5, 6.5, 6.5], 5)), 'FAIR');
    assert.equal(academicLevel(eight([9, 9, 9, 9, 9, 9, 9], 4.9)), 'PASS'); // one subject below 5.0
  });
  it('PASS: at least 6 subjects >= 5.0 and none below 3.5', () => {
    assert.equal(academicLevel(eight([5, 5, 5, 5, 5, 5], 3.5)), 'PASS');
    assert.equal(academicLevel(eight([9, 9, 9, 9, 9, 9, 9], 3.4)), 'FAIL'); // a subject below 3.5
    assert.equal(academicLevel(eight([5, 5, 5, 5, 5], 4.9)), 'FAIL'); // only 5 subjects >= 5.0
  });
  it('is null while a subject has no average, or without subjects', () => {
    assert.equal(academicLevel([9, null, 9]), null);
    assert.equal(academicLevel([]), null);
  });
  it('with fewer than 6 subjects, "at least 6" means all of them (ASSUMPTION)', () => {
    assert.equal(academicLevel([8, 8.5, '9.0']), 'GOOD');
    assert.equal(academicLevel([8, 7.9]), 'FAIR');
  });
});

describe('roundScore', () => {
  it('rounds half up without binary noise', () => {
    assert.equal(roundScore(7.85), 7.9);
    assert.equal(roundScore(7.849), 7.8);
    assert.equal(roundScore(8.05), 8.1);
    assert.equal(roundScore(7.825, 2), 7.83);
    assert.equal(roundScore(null), null);
  });
});

describe('missingSlots', () => {
  it('lists every empty attempt of every component', () => {
    const scores = [score(1, 1, '8'), score(1, 2, '7'), score(1, 3, null), score(2, 1, '6')];
    assert.deepEqual(missingSlots(C22, scores), [
      { componentId: 1, attemptNo: 3 },
      { componentId: 1, attemptNo: 4 },
      { componentId: 3, attemptNo: 1 },
    ]);
  });
  it('is empty when the grade book is complete', () => {
    const full = [score(1, 1, 1), score(1, 2, 2), score(1, 3, 3), score(1, 4, 4), score(2, 1, 0), score(3, 1, 10)];
    assert.deepEqual(missingSlots(C22, full), []);
  });
});

describe('parseScore', () => {
  it('accepts 0–10 with up to 2 decimals, dot or comma', () => {
    assert.deepEqual(parseScore('8'), { ok: true, value: 8 });
    assert.deepEqual(parseScore('8,5'), { ok: true, value: 8.5 });
    assert.deepEqual(parseScore(' 7.25 '), { ok: true, value: 7.25 });
    assert.deepEqual(parseScore(10), { ok: true, value: 10 });
    assert.deepEqual(parseScore('0'), { ok: true, value: 0 });
  });
  it('treats empty as no score', () => {
    assert.deepEqual(parseScore(''), { ok: true, value: null });
    assert.deepEqual(parseScore(null), { ok: true, value: null });
  });
  it('refuses anything else', () => {
    for (const bad of ['10.5', '11', '-1', 'abc', '8.123', '8..5', '1e1']) assert.equal(parseScore(bad).ok, false, bad);
  });
});

it('Circular 22 rounding: 1 decimal, second decimal 5-9 rounds up', () => {
  assert.equal(roundScore(7.94), 7.9);
  assert.equal(roundScore(7.95), 8);
  assert.equal(roundScore(6.42), 6.4);
  assert.equal(roundScore(6.48), 6.5);
  assert.equal(roundScore(7.45), 7.5);
  assert.equal(roundScore(8.05), 8.1);
});

it('Circular 22: the level uses the rounded subject averages', () => {
  // Physics 7.966… rounds to 8.0, so it counts as a subject >= 8.0 (6 of them): GOOD, not FAIR.
  const physics = roundScore(23.9 / 3);
  assert.equal(physics, 8);
  assert.equal(academicLevel([physics, 8, 8, 8, 8, 8, 7, 7]), 'GOOD');
  // Year: (HK1 6.5 + 2 × HK2 7.3) / 3 = 7.033… → 7.0
  assert.equal(roundScore(yearAverage(6.5, 7.3)), 7);
});
