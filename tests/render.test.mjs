import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { renderSvg, formatUpload } from '../src/render.mjs';
import { buildSvg } from '../src/ci.mjs';
import { serializeUsage } from '../src/data.mjs';
import { git } from '../src/git.mjs';
import { temporary, usage } from './helpers.mjs';

test('chart: deterministic same-day output, rolling unknown dates, actual upload commit time', async t => {
  const value = usage({ '2026-11-15': 0, '2026-11-14': 50 });
  const options = { lastUpdated: '2026-11-15T06:30:00Z', timezone: 'Asia/Singapore', now: new Date('2026-11-15T07:00:00Z') };
  const svg = renderSvg(value, options);
  assert.equal(svg, renderSvg(value, { ...options, now: new Date('2026-11-15T08:00:00Z') }));
  const tomorrow = renderSvg(value, { ...options, now: new Date('2026-11-16T07:00:00Z') });
  assert.notEqual(svg, tomorrow);
  assert.ok(svg.includes('2026-11-15: 0 tokens'));
  assert.ok(tomorrow.includes('2026-11-16: unknown / not synced'));
  const updatedLine = text => text.match(/Last updated:[^<]+/u)?.[0];
  assert.equal(updatedLine(svg), updatedLine(tomorrow));
  assert.ok(svg.includes('2026-11-15 14:30 UTC+08:00'));
  assert.ok(renderSvg(value, { ...options, theme: 'github-light' }).includes('#ffffff'));
  assert.ok(!/<text[^>]*y="(?:51|314)"/u.test(svg));
  const chinese = renderSvg(value, { ...options, language: 'zh-CN' });
  for (const text of ['Codex 活动', '累计 Token', '最长连续活跃', '目前连续天数', '1 天', '11月', '未知 / 尚未同步', '最后更新', '虚线方格表示未知']) {
    assert.ok(chinese.includes(text), text);
  }
  assert.ok(chinese.includes('2026-11-15: 0 Token'));
  const unavailable = renderSvg(usage({}, { lifetimeTokens: null, currentStreakDays: null }), { ...options, language: 'zh-CN', lastUpdated: null });
  assert.ok(unavailable.includes('暂无数据') && unavailable.includes('尚未同步'));
  assert.ok(renderSvg(usage({}, { lifetimeTokens: 287_400_000, currentStreakDays: 8 }), { ...options, language: 'zh-CN' }).includes('2.87亿'));
  assert.throws(() => renderSvg(value, { ...options, language: 'invalid' }));
  const directory = await temporary(t);
  await git(directory, ['init', '-b', 'main']);
  assert.equal(await buildSvg(directory, options), false);
  await mkdir(join(directory, 'data/codex'), { recursive: true });
  await writeFile(join(directory, 'data/codex/usage.json'), serializeUsage(value));
  await git(directory, ['add', '--', 'data/codex/usage.json']);
  await git(directory, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Upload synthetic statistics'], { GIT_AUTHOR_DATE: '2026-11-15T06:30:00Z', GIT_COMMITTER_DATE: '2026-11-15T06:30:00Z' });
  await buildSvg(directory, options);
  const generated = await readFile(join(directory, 'assets/codex-activity.svg'), 'utf8');
  assert.ok(generated.includes(`Last updated: ${formatUpload('2026-11-15T06:30:00Z', options.timezone)}`));
  await git(directory, ['add', '--', 'assets/codex-activity.svg']);
  await git(directory, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Redraw'], { GIT_AUTHOR_DATE: '2026-11-16T06:30:00Z', GIT_COMMITTER_DATE: '2026-11-16T06:30:00Z' });
  await buildSvg(directory, { ...options, now: new Date('2026-11-16T07:00:00Z') });
  assert.equal(updatedLine(await readFile(join(directory, 'assets/codex-activity.svg'), 'utf8')), updatedLine(generated));
  const configFile = join(directory, 'data/codex/config.json');
  await writeFile(configFile, JSON.stringify({ theme: 'github-light', language: 'zh-CN' }));
  await git(directory, ['add', '--', 'data/codex/config.json']);
  await git(directory, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Change display config'], { GIT_AUTHOR_DATE: '2026-11-17T06:30:00Z', GIT_COMMITTER_DATE: '2026-11-17T06:30:00Z' });
  await buildSvg(directory, { ...options, theme: 'github-dark', language: 'en' });
  const localized = await readFile(join(directory, 'assets/codex-activity.svg'), 'utf8');
  assert.ok(localized.includes('Codex 活动') && localized.includes('#ffffff'));
  assert.ok(localized.includes(`最后更新: ${formatUpload('2026-11-15T06:30:00Z', options.timezone)}`));
  for (const invalid of ['{', 'null', '{"theme":"invalid","language":"en"}', '{"theme":"github-dark","language":"invalid"}']) {
    await writeFile(configFile, invalid);
    await assert.rejects(buildSvg(directory, options));
    assert.equal(await readFile(join(directory, 'assets/codex-activity.svg'), 'utf8'), localized);
  }
});
