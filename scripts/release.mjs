// Prepare package metadata only; publishing the repository/package remains explicit.
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectRoot } from '../src/setup.mjs';
import { git } from '../src/git.mjs';
import { safeError, fail } from '../src/errors.mjs';

try {
  if (await git(projectRoot, ['status', '--porcelain'])) fail('RELEASE', '请先提交工作区更改，再准备发布元数据。');
  const ref = await git(projectRoot, ['rev-parse', 'HEAD']);
  const metadata = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'));
  const repository = metadata.repository.url.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\.git$/u)?.[1];
  if (!repository) fail('RELEASE', 'package.json 中需要正确的 GitHub 工具仓库地址。');
  const release = { repository, ref };
  await writeFile(join(projectRoot, 'templates', 'release.json'), `${JSON.stringify(release, null, 2)}\n`);
  console.log('已固定发布版本。请提交 templates/release.json 后检查 npm pack --dry-run，再执行实际发布。');
} catch (error) { console.error(safeError(error)); process.exitCode = 1; }
