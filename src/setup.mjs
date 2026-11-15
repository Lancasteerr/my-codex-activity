import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { git } from './git.mjs';
import { fail } from './errors.mjs';

export const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export async function releaseReference() {
  try {
    const release = JSON.parse(await readFile(join(projectRoot, 'templates', 'release.json'), 'utf8'));
    if (/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/u.test(release.repository)
      && /^[a-f0-9]{40}$/u.test(release.ref)) return release;
  } catch { /* Source checkouts can resolve their own committed revision. */ }
  try {
    const ref = await git(projectRoot, ['rev-parse', 'HEAD']);
    await git(projectRoot, ['cat-file', '-e', `${ref}:src/ci.mjs`]);
    const metadata = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'));
    const repository = metadata.repository.url.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\.git$/u)?.[1];
    if (repository && /^[a-f0-9]{40}$/u.test(ref)) return { repository, ref };
  } catch { /* No mutable branch or tag fallback is permitted. */ }
  fail('RELEASE', '缺少固定版本信息；请使用完整 Git checkout 或带版本信息的发布包。');
}

export function profileWorkflow(template, { branch, timezone, repository, ref }) {
  if (!/^[a-f0-9]{40}$/u.test(ref) || !/^[\w.-]+\/[\w.-]+$/u.test(repository)) fail('RELEASE', '工具发布版本无效。');
  // JSON strings are also safe YAML scalars. Never insert config into shell commands.
  return template.replaceAll('__BRANCH__', JSON.stringify(branch))
    .replaceAll('__TIMEZONE__', JSON.stringify(timezone))
    .replaceAll('__TOOL_REPOSITORY__', repository)
    .replaceAll('__TOOL_REF__', ref);
}

export async function generateSetup(config, branch, outputDirectory = join(process.cwd(), 'generated')) {
  const release = await releaseReference();
  const template = await readFile(join(projectRoot, 'templates', 'profile', 'codex-activity.yml'), 'utf8');
  const workflow = profileWorkflow(template, { branch, timezone: config.timezone, ...release });
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, 'codex-activity.yml'), workflow);
  await writeFile(join(outputDirectory, 'README-snippet.md'), '## My Codex Activity\n\n![Codex Activity](./assets/codex-activity.svg)\n');
  await writeFile(join(outputDirectory, 'SETUP.md'), [
    '# Profile 接入', '',
    `目标仓库：${config.repository}；默认分支：${branch}。`, '',
    '1. 将 codex-activity.yml 放入目标仓库 .github/workflows/。',
    '2. 将 README-snippet.md 中的内容加入 Profile README。',
    '3. 运行 npm run sync；不需要创建空 JSON 或配置仓库 Secrets。', '',
    `工具引用：${release.repository}@${release.ref}。该提交必须已在公开工具仓库中发布，GitHub 才能执行工作流。`,
    '升级时重新运行 setup，将生成的新入口替换到 Profile。不要复制 .env。', '',
  ].join('\n'));
  return { release, outputDirectory };
}
