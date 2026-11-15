import { fail } from './errors.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validNumber = value => Number.isSafeInteger(value) && value >= 0;

export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function summaryOf(value) {
  if (!object(value)) fail('DATA', '统计汇总结构无效；未上传。');
  const summary = {};
  for (const key of ['lifetimeTokens', 'currentStreakDays']) {
    const metric = value[key] ?? null;
    if (metric !== null && !validNumber(metric)) fail('DATA', '统计数值无效；未上传。');
    summary[key] = metric;
  }
  return summary;
}

export function normalizeUsage(value) {
  if (!object(value) || value.schemaVersion !== 1 || value.source !== 'codex-app-server'
    || !object(value.daily)) fail('DATA', '统计文件格式不兼容；未覆盖现有数据。');
  const daily = {};
  for (const date of Object.keys(value.daily).sort()) {
    if (!validDate(date) || !validNumber(value.daily[date])) fail('DATA', '每日统计无效；未上传。');
    daily[date] = value.daily[date];
  }
  return { schemaVersion: 1, source: 'codex-app-server', summary: summaryOf(value.summary), daily };
}

export function fromRpc(result) {
  if (!object(result) || !Array.isArray(result.dailyUsageBuckets)) {
    fail('DATA', '每日统计暂不可用；未上传或清空历史。');
  }
  const daily = {};
  for (const bucket of result.dailyUsageBuckets) {
    if (!object(bucket) || !validDate(bucket.startDate) || !validNumber(bucket.tokens)
      || Object.hasOwn(daily, bucket.startDate)) fail('DATA', '每日统计结构无效；未上传。');
    daily[bucket.startDate] = bucket.tokens;
  }
  const summary = summaryOf(result.summary);
  if (result.dailyUsageBuckets.length === 0 && Object.values(summary).every(value => value === null)) {
    fail('DATA', '服务尚未提供有效统计；未上传。');
  }
  return normalizeUsage({ schemaVersion: 1, source: 'codex-app-server', summary, daily });
}

export function mergeUsage(...snapshots) {
  let result = null;
  for (const snapshot of snapshots.filter(Boolean)) {
    const next = normalizeUsage(snapshot);
    result = { ...next, daily: { ...result?.daily, ...next.daily } };
  }
  if (!result) fail('DATA', '没有可发布的统计。');
  return normalizeUsage(result);
}

export function serializeUsage(value) {
  return `${JSON.stringify(normalizeUsage(value), null, 2)}\n`;
}

export function sameUsage(a, b) {
  return a !== null && b !== null && serializeUsage(a) === serializeUsage(b);
}
