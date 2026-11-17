import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readConfig } from '../src/config.mjs';
import { main } from '../src/cli.mjs';
import { safeError } from '../src/errors.mjs';
import { GitHubClient } from '../src/github.mjs';
import { generateSetup, projectRoot, toolRepository } from '../src/setup.mjs';
import { temporary, usage } from './helpers.mjs';

// 所有配置和网络响应均为合成数据，避免读取本机凭据或访问真实上游。
const secret = 'github_pat_SETUP_SYNTHETIC_SECRET';
const baseEnv = `GITHUB_TOKEN=${secret}\nGITHUB_REPOSITORY=example/example\nTIMEZONE=Asia/Singapore\n`;
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('setup: env override and empty defaults select one upstream for checks and generated files', async t => {
  const directory = await temporary(t);
  const envFile = join(directory, 'selected.env');
  const defaultRepository = await toolRepository();
  const action = await readFile(join(projectRoot, 'action.yml'), 'utf8');
  const previous = process.env.TOOL_REPOSITORY;
  process.env.TOOL_REPOSITORY = 'process-only/ignored';
  t.after(() => {
    if (previous === undefined) delete process.env.TOOL_REPOSITORY;
    else process.env.TOOL_REPOSITORY = previous;
  });
  const environment = { ...process.env };
  let selectedRepository;
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(url);
    // 公开 Action 检查不得向自定义上游透传 Profile Token。
    assert.equal(new Headers(options.headers).has('Authorization'), false);
    assert.ok(!JSON.stringify(options).includes(secret));
    assert.equal(options.redirect, 'error');
    const base = `https://api.github.com/repos/${selectedRepository}`;
    assert.ok(url === base || url === `${base}/contents/action.yml?ref=main`);
    return reply(url === base
      ? { private: false, visibility: 'public' }
      : { type: 'file', encoding: 'base64', content: Buffer.from(action).toString('base64') });
  });

  const cases = [
    { name: 'missing', setting: '', repository: null },
    { name: 'empty', setting: 'TOOL_REPOSITORY=\n', repository: null },
    { name: 'whitespace', setting: 'TOOL_REPOSITORY="   "\n', repository: null },
    { name: 'custom', setting: 'TOOL_REPOSITORY="  custom-owner/activity_tool.v2  "\n', repository: 'custom-owner/activity_tool.v2' },
  ];
  for (const { name, setting, repository } of cases) {
    await writeFile(envFile, baseEnv + setting);
    const config = await readConfig(envFile);
    assert.equal(config.toolRepository, repository);
    selectedRepository = repository ?? defaultRepository;
    requests.length = 0;
    const outputDirectory = join(directory, name);
    const result = await generateSetup(config, 'profile-branch', outputDirectory);
    assert.equal(result.repository, selectedRepository);
    assert.deepEqual(requests, [
      `https://api.github.com/repos/${selectedRepository}`,
      `https://api.github.com/repos/${selectedRepository}/contents/action.yml?ref=main`,
    ]);
    const workflow = await readFile(join(outputDirectory, 'codex-activity.yml'), 'utf8');
    assert.ok(workflow.includes(`uses: ${selectedRepository}@main`));
    assert.ok(workflow.includes('branches: ["profile-branch"]'));
    assert.ok(!workflow.includes('__'));
    for (const filename of await readdir(outputDirectory)) {
      const contents = await readFile(join(outputDirectory, filename), 'utf8');
      assert.ok(!contents.includes(secret));
      assert.ok(!contents.includes('process-only/ignored'));
      if (filename.startsWith('SETUP')) {
        assert.ok(contents.includes(`${selectedRepository}@main`));
        assert.ok(contents.includes('TOOL_REPOSITORY'));
        assert.ok(contents.includes('sync'));
      }
    }
    assert.deepEqual({ ...process.env }, environment);
  }
});

test('setup: invalid upstream fails before collection or network access without exposing secrets', async t => {
  const directory = await temporary(t);
  const envFile = join(directory, 'invalid.env');
  const network = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('配置无效时不应发起网络请求。');
  });
  for (const repository of [
    'https://github.com/example/tool', 'example/tool@main', 'example/tool@v1',
    `example/tool@${'a'.repeat(40)}`, 'example/tool/extra', 'example',
    'example owner/tool', 'example/tool?ref=main', `example/${secret}@main`,
  ]) {
    await writeFile(envFile, `${baseEnv}TOOL_REPOSITORY="${repository}"\n`);
    await assert.rejects(main(['setup', '--env-file', envFile]), error => {
      assert.equal(error.code, 'CONFIG');
      assert.ok(safeError(error).includes('TOOL_REPOSITORY'));
      assert.ok(!safeError(error).includes(secret));
      return true;
    });
  }
  assert.equal(network.mock.callCount(), 0);
});

test('setup: inaccessible or incompatible public Action leaves no generated files', async t => {
  const directory = await temporary(t);
  let failure;
  t.mock.method(globalThis, 'fetch', async url => {
    if (failure === 'missing-repository') return reply({}, 404);
    if (!url.includes('/contents/')) return reply({ private: failure === 'private', visibility: failure === 'private' ? 'private' : 'public' });
    if (failure === 'missing-action') return reply({}, 404);
    return reply({ type: 'file', encoding: 'base64', content: Buffer.from('runs:\n  using: node24\n').toString('base64') });
  });
  for (failure of ['missing-repository', 'private', 'missing-action', 'incompatible']) {
    const outputDirectory = join(directory, failure);
    await assert.rejects(generateSetup({ toolRepository: 'custom/tool' }, 'main', outputDirectory), error => error.code === 'ACTION_ACCESS');
    await assert.rejects(readdir(outputDirectory), error => error.code === 'ENOENT');
  }
});

test('setup: upstream configuration stays out of uploaded public JSON', async t => {
  const directory = await temporary(t);
  const envFile = join(directory, 'upload.env');
  await writeFile(envFile, `${baseEnv}TOOL_REPOSITORY=custom/tool\n`);
  const config = await readConfig(envFile);
  const uploaded = [];
  const client = new GitHubClient({ ...config, fetchImpl: async (url, options) => {
    assert.ok(url.startsWith('https://api.github.com/repos/example/example/contents/'));
    const body = JSON.parse(options.body);
    uploaded.push(JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')));
    return reply({ commit: { committer: { date: '2026-11-17T00:00:00Z' } } }, 201);
  } });
  // 即使调用者传入额外的本机配置，公开序列化仍只保留约定字段。
  await client.writeUsage('main', { ...usage(), toolRepository: config.toolRepository }, null);
  await client.writeDisplayConfig('main', config, null);
  assert.deepEqual(uploaded[0], usage({}, { lifetimeTokens: 100, currentStreakDays: 1, longestStreakDays: null }));
  assert.deepEqual(uploaded[1], { theme: 'github-dark', language: 'en' });
  assert.ok(!JSON.stringify(uploaded).includes('custom/tool'));
  assert.ok(!JSON.stringify(uploaded).includes(secret));
});
