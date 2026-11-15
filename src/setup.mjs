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

export async function verifyRelease(release, { fetchImpl = fetch } = {}) {
  if (!/^[\w.-]+\/[\w.-]+$/u.test(release.repository) || !/^[a-f0-9]{40}$/u.test(release.ref)) {
    fail('RELEASE', '工具发布版本无效。');
  }
  // Public lookup only: never send the Profile PAT to the tool repository.
  const readPublic = async path => {
    let response;
    try {
      response = await fetchImpl(`https://api.github.com/repos/${release.repository}${path}`, {
        redirect: 'error', signal: AbortSignal.timeout(15_000),
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'codex-activity/0.1.0' },
      });
    } catch { fail('RELEASE_ACCESS', '无法验证公开工具版本，请检查网络后重试。'); }
    if (!response.ok) {
      await response.body?.cancel();
      fail('RELEASE_ACCESS', '工具仓库或固定版本不可公开访问；请先发布正确的工具仓库及提交。');
    }
    try { return await response.json(); }
    catch { fail('RELEASE_ACCESS', '公开工具版本检查返回无效数据。'); }
  };
  const repository = await readPublic('');
  if (repository.private !== false || repository.visibility !== 'public') {
    fail('RELEASE_ACCESS', '公开 Profile 需要调用公开工具仓库，请先检查工具仓库可见性。');
  }
  const file = await readPublic(`/contents/.github/workflows/render.yml?ref=${release.ref}`);
  if (file.type !== 'file' || file.encoding !== 'base64' || typeof file.content !== 'string') {
    fail('RELEASE_ACCESS', '指定工具版本中缺少可复用工作流。');
  }
  const workflow = Buffer.from(file.content, 'base64').toString('utf8');
  if (!/^\s*workflow_call:/mu.test(workflow)) fail('RELEASE_ACCESS', '指定工具工作流没有 workflow_call 入口。');
  const checkoutRepository = workflow.match(/^\s*repository:\s*([^\s#]+)\s*$/mu)?.[1];
  if (checkoutRepository !== release.repository) {
    fail('RELEASE_ACCESS', '固定工作流的渲染代码仓库与发布元数据不一致；请发布修正后的新提交。');
  }
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
  await verifyRelease(release);
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
