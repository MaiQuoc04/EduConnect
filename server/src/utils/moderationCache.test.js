// Unit tests for the in-memory moderation rules (moderation phase 4, step 0): nothing a request does may wait for a
// load of the rules. Run: npm test (node --test). The loader is injected; no database.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRuleIndex } from './moderation.js';
import { createModerationCache } from './moderationCache.js';

const RULES = [
  { ruleId: 1, pattern: 'giết mày', matchType: 'PHRASE', accentInsensitive: false, category: 'VIOLENCE', isActive: true },
  { ruleId: 2, pattern: 'vcl', matchType: 'WORD', accentInsensitive: true, category: 'INAPPROPRIATE_LANGUAGE', isActive: true },
];
const COPY = { enabled: true, index: buildRuleIndex(RULES) };
const NOT_HIDDEN = { hidden: false, category: null, ruleIds: [] };

// A promise we settle by hand; never settled = a load that hangs forever.
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Loader whose every call returns the next promise from `answers` (a value, an Error, or a deferred).
function scriptedLoader(answers) {
  const calls = [];
  const load = () => {
    const answer = answers[calls.length] ?? deferred(); // past the script: hang
    calls.push(answer);
    if (answer instanceof Error) return Promise.reject(answer);
    if (answer?.promise) return answer.promise;
    return Promise.resolve(answer);
  };
  return { load, calls };
}

const quietLogger = () => {
  const lines = { warn: [], error: [] };
  return { lines, logger: { warn: (...a) => lines.warn.push(a.join(' ')), error: (...a) => lines.error.push(a.join(' ')) } };
};
const flush = () => new Promise((resolve) => setImmediate(resolve)); // let settled promises run their callbacks

describe('moderation cache – never waits for a load', () => {
  it('answers at once while the very first load hangs: the check is off, logged once, one load only', async () => {
    const hanging = deferred();
    const { load, calls } = scriptedLoader([hanging]);
    const { lines, logger } = quietLogger();
    const cache = createModerationCache({ load, logger });
    for (let i = 0; i < 5; i += 1) {
      const result = cache.moderate('tao giết mày'); // synchronous: it cannot be waiting for anything
      assert.deepEqual(result, NOT_HIDDEN);
    }
    assert.deepEqual(cache.get(), { enabled: false, index: null });
    await flush();
    assert.equal(calls.length, 1, 'one load at a time');
    assert.equal(lines.warn.length, 1, 'the "not loaded yet" line is written once');
  });

  it('keeps checking with the old copy while a reload of an expired copy hangs', async () => {
    let clock = 0;
    const hanging = deferred();
    const { load, calls } = scriptedLoader([COPY, hanging]);
    const cache = createModerationCache({ load, now: () => clock, maxAgeMs: 1000, logger: quietLogger().logger });
    cache.start();
    await flush();
    assert.equal(cache.moderate('tao giết mày').hidden, true);
    clock = 5000; // the copy is now too old: a reload starts in the background and hangs
    const started = performance.now();
    for (let i = 0; i < 20; i += 1) {
      assert.deepEqual(cache.moderate('tao giết mày'), { hidden: true, category: 'VIOLENCE', ruleIds: [1] });
    }
    assert.ok(performance.now() - started < 50, 'twenty checks did not wait for the hanging load');
    await flush();
    assert.equal(calls.length, 2, 'the expired copy started exactly one background load');
  });

  it('a hanging load does not block several requests sent together (like comments in their transactions)', async () => {
    const { load } = scriptedLoader([COPY, deferred()]);
    const cache = createModerationCache({ load, logger: quietLogger().logger });
    cache.start();
    await flush();
    cache.invalidate(); // the reload hangs
    const outcome = await Promise.race([
      Promise.all(['vcl', 'giết mày nhé', 'chào cả lớp'].map(async (t) => cache.moderate(t))),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 200)),
    ]);
    assert.notEqual(outcome, 'timeout');
    assert.deepEqual(outcome.map((r) => r.hidden), [true, true, false]);
  });
});

describe('moderation cache – invalidate', () => {
  it('keeps serving the current copy until the new one has arrived, then uses the new one', async () => {
    const next = deferred();
    const { load } = scriptedLoader([COPY, next]);
    const cache = createModerationCache({ load, logger: quietLogger().logger });
    cache.start();
    await flush();
    cache.invalidate();
    assert.equal(cache.moderate('vcl').hidden, true, 'old copy still serves');
    next.resolve({ enabled: true, index: buildRuleIndex([]) }); // the School Manager removed every rule
    await flush();
    await flush();
    assert.equal(cache.moderate('vcl').hidden, false, 'new copy in use');
  });

  it('a load started before invalidate never replaces the newer one, and a fresh load follows it', async () => {
    const old = deferred();
    const { load, calls } = scriptedLoader([old, { enabled: false, index: buildRuleIndex([]) }]);
    const cache = createModerationCache({ load, logger: quietLogger().logger });
    cache.start(); // load #1 hangs for now
    cache.invalidate(); // a rule changed while #1 runs: #1 is from before the change
    await flush();
    assert.equal(calls.length, 1, 'still one load at a time');
    old.resolve(COPY); // #1 answers late with the old rules
    await flush();
    await flush();
    await flush();
    assert.equal(calls.length, 2, 'a new load started once #1 ended');
    assert.deepEqual(cache.get(), { enabled: false, index: cache.get().index }, 'the newer answer (#2) is in use');
    assert.equal(cache.moderate('vcl').hidden, false);
  });
});

describe('moderation cache – failures', () => {
  it('keeps the copy after a failed reload and tries again only after retryMs', async () => {
    let clock = 0;
    const { load, calls } = scriptedLoader([COPY, new Error('database down'), COPY]);
    const { lines, logger } = quietLogger();
    const cache = createModerationCache({ load, now: () => clock, maxAgeMs: 1000, retryMs: 60000, logger });
    cache.start();
    await flush();
    clock = 2000;
    cache.get(); // expired: reload #2 fails
    await flush();
    await flush();
    assert.equal(lines.error.length, 1);
    assert.equal(cache.moderate('vcl').hidden, true, 'the previous copy stays in use');
    clock = 30000;
    cache.get();
    await flush();
    assert.equal(calls.length, 2, 'no new attempt before retryMs');
    clock = 62001;
    cache.get();
    await flush();
    assert.equal(calls.length, 3, 'tried again after retryMs');
  });

  it('never throws when the check itself fails', () => {
    const broken = { get exact() { throw new Error('broken index'); }, folded: {} };
    const { lines, logger } = quietLogger();
    const cache = createModerationCache({ load: async () => ({ enabled: true, index: broken }), logger });
    return (async () => {
      cache.start();
      await flush();
      assert.deepEqual(cache.moderate('vcl'), NOT_HIDDEN);
      assert.equal(lines.error.length, 1);
    })();
  });
});
