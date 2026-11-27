// Measures the sample rules against the labelled samples (moderation phase 1, docs/moderation-plan.md
// "Kiểm thử và chỉ số"). No database: reads rules.sample.json and samples.json next to this file.
// Run in server/: node scripts/moderation/eval.js
// Exit code 1 when any clean sample is caught (false positive): with no human review a false hit hides
// innocent content, so it matters more than a miss.
import { readFileSync } from 'node:fs';
import { buildRuleIndex, checkContent } from '../../src/utils/moderation.js';

const load = (name) => JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), 'utf8'));
const rules = load('rules.sample.json');
const samples = load('samples.json');

const patternOf = new Map(rules.map((r) => [Number(r.ruleId), r.pattern]));
const describeHits = (ids) => ids.map((id) => `#${id} "${patternOf.get(id)}"`).join(', ');

const index = buildRuleIndex(rules);
const falsePositives = [];
const misses = [];
const wrongCategory = [];
let truePositives = 0;

for (const sample of samples) {
  const result = checkContent(sample.text, index);
  if (result.matched && sample.expected) {
    truePositives += 1;
    if (sample.category && result.category !== sample.category) wrongCategory.push({ sample, result });
  } else if (result.matched && !sample.expected) {
    falsePositives.push({ sample, result });
  } else if (!result.matched && sample.expected) {
    misses.push({ sample, result });
  }
}

const positives = samples.filter((s) => s.expected).length;
const negatives = samples.length - positives;
const caught = truePositives + falsePositives.length;
const pct = (num, den) => (den ? `${((num / den) * 100).toFixed(1)}%` : 'n/a');
const line = (s) => `  - ${JSON.stringify(s.text)}${s.note ? `  (${s.note})` : ''}`;

console.log(`Rules: ${rules.length} (${rules.filter((r) => r.isActive !== false).length} active)`);
console.log(`Samples: ${samples.length} (${positives} violating, ${negatives} clean)`);
console.log('');

console.log(`False positives (clean but caught): ${falsePositives.length}`);
for (const { sample, result } of falsePositives) console.log(`${line(sample)}\n      matched ${describeHits(result.ruleIds)}`);
console.log('');

console.log(`Misses (violating but not caught): ${misses.length}`);
for (const { sample } of misses) console.log(`${line(sample)}  [${sample.category ?? '-'}]`);
console.log('');

if (wrongCategory.length) {
  console.log(`Caught with a different category than labelled: ${wrongCategory.length}`);
  for (const { sample, result } of wrongCategory) {
    console.log(`${line(sample)}\n      labelled ${sample.category}, got ${result.category} via ${describeHits(result.ruleIds)}`);
  }
  console.log('');
}

console.log('Summary');
console.log(`  True positives : ${truePositives}`);
console.log(`  False positives: ${falsePositives.length}`);
console.log(`  Misses         : ${misses.length}`);
console.log(`  Precision      : ${pct(truePositives, caught)}  (${truePositives}/${caught})`);
console.log(`  Recall         : ${pct(truePositives, positives)}  (${truePositives}/${positives})`);
console.log(`  Category agrees: ${pct(truePositives - wrongCategory.length, truePositives)}`);

process.exitCode = falsePositives.length ? 1 : 0;
