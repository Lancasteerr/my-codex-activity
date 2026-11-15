import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';

export async function temporary(test) {
  const base = await realpath(tmpdir());
  const directory = await mkdtemp(join(base, 'codex-activity-test-'));
  test.after(async () => {
    const target = await realpath(directory);
    const child = relative(base, target);
    if (target !== resolve(directory) || isAbsolute(child) || child.startsWith('..') || !child.startsWith('codex-activity-test-')) {
      throw new Error('Refusing to remove a path outside the created test directory.');
    }
    await rm(target, { recursive: true, force: true });
  });
  return directory;
}

export function usage(daily = {}, summary = { lifetimeTokens: 100, currentStreakDays: 1 }) {
  return { schemaVersion: 1, source: 'codex-app-server', summary, daily };
}
