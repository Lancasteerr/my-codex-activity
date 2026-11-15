import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GitHubClient, uploadUsage, syncDisplayConfig } from '../src/github.mjs';
import { usage } from './helpers.mjs';

test('upload: create/update, skip unchanged, merge SHA conflicts and confirm lost responses', async () => {
  let stored = null;
  let writes = 0;
  let mode = '';
  let display = null;
  let displayWrites = 0;
  let displayMode = '';
  const sha = () => createHash('sha1').update(JSON.stringify(stored)).digest('hex');
  const displaySha = () => createHash('sha1').update(JSON.stringify(display)).digest('hex');
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
  const client = new GitHubClient({ token: 'SYNTHETIC', repository: 'example/example', sleep: async () => {}, fetchImpl: async (url, options) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/contents/data/codex/config.json')) {
      if (options.method === 'PUT') {
        const body = JSON.parse(options.body);
        assert.equal(body.committer.email, 'example@users.noreply.github.com');
        displayWrites++;
        if (displayMode === 'denied') return reply({}, 403);
        if (displayMode === 'conflict') {
          display = { theme: 'github-dark', language: 'en' };
          displayMode = '';
          return reply({}, 409);
        }
        assert.equal(body.sha, display ? displaySha() : undefined);
        display = JSON.parse(Buffer.from(body.content, 'base64').toString());
        assert.deepEqual(Object.keys(display).sort(), ['language', 'theme']);
        if (displayMode === 'lost') { displayMode = ''; throw new Error('lost configuration response'); }
        return reply({ commit: { committer: { date: '2026-11-17T06:30:00Z' } } }, 201);
      }
      return display ? reply({ type: 'file', encoding: 'base64', sha: displaySha(), content: Buffer.from(JSON.stringify(display)).toString('base64') }) : reply({}, 404);
    }
    if (path.endsWith('/commits')) {
      assert.equal(new URL(url).searchParams.get('path'), 'data/codex/usage.json');
      return reply([{ commit: { committer: { date: '2026-11-15T06:30:00Z' } } }]);
    }
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body);
      assert.equal(body.committer.email, 'example@users.noreply.github.com');
      writes++;
      if (mode === 'conflict') {
        stored.daily['2026-01-01'] = 9;
        mode = '';
        return reply({}, 409);
      }
      assert.equal(body.sha, stored ? sha() : undefined);
      stored = JSON.parse(Buffer.from(body.content, 'base64').toString());
      if (mode === 'lost') { mode = ''; throw new Error('private upstream error'); }
      return reply({ commit: { committer: { date: '2026-11-15T06:30:00Z' } } }, 201);
    }
    if (path.includes('/contents/')) return stored ? reply({ type: 'file', encoding: 'base64', sha: sha(), content: Buffer.from(JSON.stringify(stored)).toString('base64') }) : reply({}, 404);
    if (path.includes('/branches/')) return reply({ name: 'main' });
    return reply({ default_branch: 'main' });
  } });
  const { branch } = await client.repositoryInfo();
  const latest = usage({ '2026-11-15': 20 });
  assert.equal((await uploadUsage(client, { branch, latest })).changed, true);
  assert.equal(writes, 1);
  assert.equal((await uploadUsage(client, { branch, latest })).changed, false);
  assert.equal(writes, 1);
  mode = 'conflict';
  await uploadUsage(client, { branch, latest: usage({ '2026-11-15': 25 }) });
  assert.equal(stored.daily['2026-01-01'], 9);
  assert.equal(stored.daily['2026-11-15'], 25);
  mode = 'lost';
  const before = writes;
  const confirmed = await uploadUsage(client, { branch, latest: usage({ '2026-11-15': 30 }) });
  assert.equal(confirmed.confirmed, true);
  assert.equal(writes, before + 1);
  const dataWrites = writes;
  const uploadTime = await client.lastUpload(branch);
  const settings = { branch, theme: 'github-light', language: 'zh-CN' };
  assert.equal((await syncDisplayConfig(client, settings)).changed, true);
  assert.equal(displayWrites, 1);
  assert.equal((await syncDisplayConfig(client, settings)).changed, false);
  assert.equal(displayWrites, 1);
  displayMode = 'conflict';
  await syncDisplayConfig(client, { ...settings, language: 'en' });
  assert.equal(display.theme, 'github-light');
  assert.equal(display.language, 'en');
  displayMode = 'lost';
  const previousDisplayWrites = displayWrites;
  assert.equal((await syncDisplayConfig(client, settings)).confirmed, true);
  assert.equal(displayWrites, previousDisplayWrites + 1);
  assert.equal(writes, dataWrites);
  assert.equal(await client.lastUpload(branch), uploadTime);
  displayMode = 'denied';
  await assert.rejects(syncDisplayConfig(client, { ...settings, language: 'en' }), error => error.status === 403);
  displayMode = '';
  assert.equal((await syncDisplayConfig(client, { ...settings, language: 'en' })).changed, true);
});
