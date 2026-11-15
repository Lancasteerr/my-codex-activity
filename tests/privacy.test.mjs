import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readConfig, normalizeDisplayConfig } from '../src/config.mjs';
import { collectorEnvironment } from '../src/collector.mjs';
import { fromRpc, serializeUsage } from '../src/data.mjs';
import { GitHubClient } from '../src/github.mjs';
import { safeError } from '../src/errors.mjs';
import { renderSvg } from '../src/render.mjs';
import { git } from '../src/git.mjs';
import { projectRoot, profileWorkflow, setupDocuments, verifyRelease } from '../src/setup.mjs';
import { temporary } from './helpers.mjs';

test('privacy: isolate dotenv, whitelist data, suppress upstream errors and exclude secrets', async t => {
  const directory = await temporary(t);
  const secret = 'github_pat_SYNTHETIC_SECRET_ONLY';
  const email = 'private-fixture@example.invalid';
  const envFile = join(directory, '.env');
  const previous = process.env.GITHUB_TOKEN;
  await writeFile(envFile, `GITHUB_TOKEN=${secret}\nGITHUB_REPOSITORY=example/example\nTIMEZONE=Asia/Singapore\nNODE_OPTIONS=do-not-inject\n`);
  const config = await readConfig(envFile);
  assert.equal(config.token, secret);
  assert.equal(process.env.GITHUB_TOKEN, previous);
  assert.equal(config.NODE_OPTIONS, undefined);
  assert.deepEqual({ theme: config.theme, language: config.language }, { theme: 'github-dark', language: 'en' });
  const envText = await readFile(envFile, 'utf8');
  await writeFile(envFile, `${envText}ACTIVITY_THEME=github-light\nACTIVITY_LANGUAGE=zh-CN\n`);
  const localized = await readConfig(envFile);
  assert.equal(localized.theme, 'github-light');
  assert.equal(localized.language, 'zh-CN');
  await writeFile(envFile, `${envText}ACTIVITY_THEME=\nACTIVITY_LANGUAGE=\n`);
  assert.equal((await readConfig(envFile)).language, 'en');
  assert.equal((await readConfig(envFile)).theme, 'github-dark');
  for (const setting of ['ACTIVITY_THEME=invalid', 'ACTIVITY_LANGUAGE=invalid']) {
    await writeFile(envFile, `${envText}${setting}\n`);
    await assert.rejects(readConfig(envFile), error => error.code === 'CONFIG' && !safeError(error).includes(secret));
  }
  assert.deepEqual(normalizeDisplayConfig({ ...localized, email }), { theme: 'github-light', language: 'zh-CN' });
  const raw = {
    summary: { lifetimeTokens: 100, currentStreakDays: 1, token: secret, email },
    dailyUsageBuckets: [{ startDate: '2026-11-15', tokens: 100, cookie: secret }],
    accessToken: secret, email,
  };
  const snapshot = fromRpc(raw);
  const output = serializeUsage(snapshot) + renderSvg(snapshot, { lastUpdated: '2026-11-15T06:30:00Z', now: new Date('2026-11-15T07:00:00Z') });
  assert.ok(!output.includes(secret) && !output.includes(email));
  const child = collectorEnvironment({ PATH: 'safe', CODEX_HOME: 'local-store', GITHUB_TOKEN: secret, GH_TOKEN: secret, OPENAI_API_KEY: secret, DEBUG: 'yes', NODE_OPTIONS: '--inspect' });
  assert.deepEqual(child, { PATH: 'safe', CODEX_HOME: 'local-store' });
  const client = new GitHubClient({ ...config, fetchImpl: async (url, options) => {
    assert.equal(new URL(url).origin, 'https://api.github.com');
    assert.equal(options.redirect, 'error');
    throw new Error(`${secret} ${email}`);
  }, sleep: async () => {} });
  await assert.rejects(client.repositoryInfo(), error => !safeError(error).includes(secret) && !safeError(error).includes(email));
  const denied = new GitHubClient({ ...config, fetchImpl: async () => new Response(JSON.stringify({
    message: `Resource not accessible by personal access token ${secret}`,
  }), { status: 403 }) });
  await assert.rejects(denied.repositoryInfo(), error => safeError(error).includes('Contents') && !safeError(error).includes(secret));
  assert.ok(!safeError(new Error(secret)).includes(secret));
  assert.equal(await git(projectRoot, ['check-ignore', '--no-index', '.env', '.env.local']), '.env\n.env.local');
  await assert.rejects(git(projectRoot, ['check-ignore', '--no-index', '.env.example']));
  const pkg = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'));
  assert.ok(pkg.files.includes('.env.example') && !pkg.files.includes('.env') && !pkg.files.includes('*'));
  const template = await readFile(join(projectRoot, 'templates/profile/codex-activity.yml'), 'utf8');
  const workflow = profileWorkflow(template, { branch: 'main', timezone: config.timezone, repository: 'example/tool', ref: 'a'.repeat(40) });
  assert.ok(!workflow.includes(secret) && workflow.includes('timezone: "Asia/Singapore"'));
  assert.ok(workflow.includes(`@${'a'.repeat(40)}`));
  assert.ok(workflow.includes("'data/codex/config.json'"));
  const release = { repository: 'example/tool', ref: 'a'.repeat(40) };
  const documents = setupDocuments(config, 'main', release);
  assert.deepEqual(Object.keys(documents).sort(), ['README-snippet.en.md', 'README-snippet.md', 'SETUP.en.md', 'SETUP.md']);
  for (const contents of Object.values(documents)) {
    assert.ok(!contents.includes(secret) && !contents.includes(email));
  }
  assert.ok(documents['SETUP.md'].includes('[English](./SETUP.en.md)'));
  assert.ok(documents['SETUP.en.md'].includes('[简体中文（默认）](./SETUP.md)'));
  for (const [locale, title] of [['', '我的 Codex 活动'], ['.en', 'My Codex Activity']]) {
    assert.ok(documents[`README-snippet${locale}.md`].startsWith(`## ${title}\n`));
    assert.ok(documents[`README-snippet${locale}.md`].includes('(./assets/codex-activity.svg)'));
    assert.ok(documents[`SETUP${locale}.md`].includes(`(./README-snippet${locale}.md)`));
    assert.ok(documents[`SETUP${locale}.md`].includes(`${release.repository}@${release.ref}`));
    assert.ok(documents[`SETUP${locale}.md`].includes(config.repository));
  }
  let source = 'on:\n  workflow_call:\njobs:\n  render:\n    repository: example/tool\n';
  const fetchPublic = async (url, options) => {
    assert.equal(options.headers.Authorization, undefined);
    return new Response(JSON.stringify(url.includes('/contents/')
      ? { type: 'file', encoding: 'base64', content: Buffer.from(source).toString('base64') }
      : { private: false, visibility: 'public' }));
  };
  await verifyRelease(release, { fetchImpl: fetchPublic });
  source = source.replace('example/tool', 'example/wrong');
  await assert.rejects(verifyRelease(release, { fetchImpl: fetchPublic }), error => error.code === 'RELEASE_ACCESS');
  await assert.rejects(verifyRelease(release, { fetchImpl: async () => new Response('{}', { status: 404 }) }), error => error.code === 'RELEASE_ACCESS');
});
