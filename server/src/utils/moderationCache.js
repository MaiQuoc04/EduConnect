// The in-memory copy of the moderation rules, as a pure factory (no database, no env) so it can be tested with an
// injected loader. utils/moderationRules.js builds the one the server uses, with the real loader.
//
// The rule that matters: NOTHING in a request ever waits for the database because of the rules. Callers of get()
// may hold a pooled connection inside a transaction (the pool has 3 connections and no timeout); if they waited for
// a load that needs a connection too, a few comments sent together at the wrong moment would hang the whole server.
// So:
//   - get() answers at once with the copy it has; a copy older than maxAgeMs starts ONE load in the background,
//     which nobody waits for;
//   - before the first successful load get() answers { enabled: false, index: null } (the check is off) and logs it
//     once;
//   - invalidate() keeps serving the current copy, marks it stale and starts a reload in the background; a load
//     started before an invalidate() never replaces the newer one (generation);
//   - a failed load keeps the current copy and is tried again after retryMs;
//   - one load at a time.

import { checkContent } from './moderation.js';

const NOT_HIDDEN = Object.freeze({ hidden: false, category: null, ruleIds: [] });

/**
 * @param {object} options
 * @param {() => Promise<{ enabled: boolean, index: object }>} options.load reads the switch and builds the index
 * @param {number} [options.maxAgeMs] a copy older than this is reloaded (in the background)
 * @param {number} [options.retryMs] wait after a failed load before trying again
 * @param {() => number} [options.now] clock (tests)
 * @param {{ warn: Function, error: Function }} [options.logger]
 */
export function createModerationCache({ load, maxAgeMs = 5 * 60 * 1000, retryMs = 60 * 1000, now = Date.now, logger = console }) {
  let copy = null; // { enabled, index, loadedAt }
  let stale = false;
  let loading = null; // the load in progress
  let generation = 0;
  let retryAt = 0; // no load before this time (after a failure)
  let warnedNoCopy = false;

  function start() {
    if (loading || now() < retryAt) return loading;
    const startedAt = generation;
    const current = Promise.resolve()
      .then(() => load())
      .then((fresh) => {
        if (startedAt !== generation) return; // invalidated meanwhile: a newer load follows (see finally)
        copy = { enabled: fresh.enabled, index: fresh.index, loadedAt: now() };
        stale = false;
        retryAt = 0;
        warnedNoCopy = false;
      })
      .catch((err) => {
        retryAt = now() + retryMs;
        logger.error(
          copy
            ? '[moderation] Reloading the moderation rules failed, the previous copy stays in use:'
            : '[moderation] Loading the moderation rules failed, the check stays off for now:',
          err?.message,
        );
      })
      .finally(() => {
        if (loading !== current) return;
        loading = null;
        if (startedAt !== generation) start(); // invalidated while this one ran: load the newest rules now
      });
    loading = current;
    return current;
  }

  /** The current { enabled, index }, at once. Never waits for a load, never throws. */
  function get() {
    const fresh = copy && !stale && now() - copy.loadedAt < maxAgeMs;
    if (!fresh) start();
    if (!copy) {
      if (!warnedNoCopy) {
        warnedNoCopy = true;
        logger.warn('[moderation] The moderation rules are not loaded yet: comments and messages are not checked until they are.');
      }
      return { enabled: false, index: null };
    }
    return { enabled: copy.enabled, index: copy.index };
  }

  return {
    get,
    /**
     * Checks a text with the current copy: { hidden, category, ruleIds }. Synchronous, so it cannot wait for a load;
     * never throws (an error is logged and the text is let through).
     */
    moderate(text) {
      try {
        const { enabled, index } = get();
        if (!enabled || !index) return NOT_HIDDEN;
        const result = checkContent(text, index);
        if (!result.matched) return NOT_HIDDEN;
        return { hidden: true, category: result.category, ruleIds: result.ruleIds };
      } catch (err) {
        logger.error('[moderation] The content check failed, the text is saved unchecked:', err?.message);
        return NOT_HIDDEN;
      }
    },
    /** Keeps serving the current copy, reloads in the background (the School Manager edited a rule). */
    invalidate() {
      generation += 1;
      stale = true;
      retryAt = 0;
      start();
    },
    /** Starts a load now if none is running (server start). */
    start,
    /** The load in progress, or null (tests). */
    pending: () => loading,
  };
}
