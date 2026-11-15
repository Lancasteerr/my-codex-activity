// Prepare package metadata only; publishing the repository/package remains explicit.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectRoot, releaseReference } from '../src/setup.mjs';
import { git } from '../src/git.mjs';
import { safeError, fail } from '../src/errors.mjs';

try {
  if (await git(projectRoot, ['status', '--porcelain'])) fail('RELEASE', '请先提交工作区更改，再准备发布元数据。');
  const ref = await git(projectRoot, ['rev-parse', 'HEAD']);
  const release = await releaseReference();
  release.ref = ref;
  await writeFile(join(projectRoot, 'templates', 'release.json'), `${JSON.stringify(release, null, 2)}\n`);
  console.log('已固定发布版本。请提交 templates/release.json 后检查 npm pack --dry-run，再执行实际发布。');
} catch (error) { console.error(safeError(error)); process.exitCode = 1; }
