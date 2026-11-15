import test from 'node:test';
import assert from 'node:assert/strict';
import { fromRpc, mergeUsage, normalizeUsage, sameUsage, serializeUsage } from '../src/data.mjs';
import { usage } from './helpers.mjs';

test('history: initialize, replace dates, keep old dates and zero, reject unavailable data', () => {
  const first = fromRpc({ summary: { lifetimeTokens: 100, currentStreakDays: 2 }, dailyUsageBuckets: [
    { startDate: '2026-11-13', tokens: 50 }, { startDate: '2026-11-14', tokens: 0 },
  ] });
  const latest = usage({ '2026-11-15': 20, '2026-11-13': 40 }, { lifetimeTokens: 90, currentStreakDays: null });
  const merged = mergeUsage(first, latest);
  assert.deepEqual(merged.daily, { '2026-11-13': 40, '2026-11-14': 0, '2026-11-15': 20 });
  assert.deepEqual(merged.summary, { lifetimeTokens: 90, currentStreakDays: null });
  assert.ok(sameUsage(merged, mergeUsage(merged, latest)));
  assert.equal(serializeUsage(merged), serializeUsage({ ...merged, daily: Object.fromEntries(Object.entries(merged.daily).reverse()), collectedAt: 'ignored' }));
  assert.throws(() => fromRpc({ summary: {}, dailyUsageBuckets: null }));
  assert.throws(() => fromRpc({ summary: {}, dailyUsageBuckets: [] }));
  assert.throws(() => normalizeUsage(usage({ '2026-02-30': 1 })));
  assert.throws(() => normalizeUsage(usage({ '2026-11-15': -1 })));
  assert.deepEqual(fromRpc({ summary: { lifetimeTokens: 0, currentStreakDays: 0 }, dailyUsageBuckets: [] }).daily, {});
});
