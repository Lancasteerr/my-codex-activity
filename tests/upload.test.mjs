import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GitHubClient, uploadUsage } from '../src/github.mjs';
import { usage } from './helpers.mjs';

test('upload: create/update, skip unchanged, merge SHA conflicts and confirm lost responses', async () => {
  let stored = null;
  let writes = 0;
  let mode = '';
  const sha = () => createHash('sha1').update(JSON.stringify(stored)).digest('hex');
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
  const client = new GitHubClient({ token: 'SYNTHETIC', repository: 'example/example', sleep: async () => {}, fetchImpl: async (url, options) => {
    const path = new URL(url).pathname;
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body);
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
});
