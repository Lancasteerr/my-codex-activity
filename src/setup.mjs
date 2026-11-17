import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DATA_PATH, DISPLAY_CONFIG_PATH, SVG_PATH, WORKFLOW_PATH } from './config.mjs';
import { fail } from './errors.mjs';

export const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryPattern = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/u;

// 默认工具地址从包信息读取；源码目录和安装包使用相同方式，不依赖 Git 元数据。
export async function toolRepository() {
  const metadata = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'));
  const repository = metadata.repository?.url?.match(/^https:\/\/github\.com\/(.+)\.git$/u)?.[1];
  if (!repositoryPattern.test(repository ?? '')) fail('CONFIG', 'package.json 中需要有效的 GitHub 工具仓库地址。');
  return repository;
}

export async function verifyAction(repository, { fetchImpl = fetch } = {}) {
  if (!repositoryPattern.test(repository)) fail('CONFIG', '工具仓库地址无效。');
  // 只匿名读取公开 Action，绝不向工具仓库发送 Profile Token。
  const readPublic = async path => {
    let response;
    try {
      response = await fetchImpl(`https://api.github.com/repos/${repository}${path}`, {
        redirect: 'error', signal: AbortSignal.timeout(15_000),
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'codex-activity/0.1.0' },
      });
    } catch { fail('ACTION_ACCESS', '无法检查公开 Action，请检查网络后重试。'); }
    if (!response.ok) {
      await response.body?.cancel();
      fail('ACTION_ACCESS', '工具仓库 main 上的 Action 不可公开访问，请先发布 action.yml。');
    }
    try { return await response.json(); }
    catch { fail('ACTION_ACCESS', '公开 Action 检查返回无效数据。'); }
  };
  const metadata = await readPublic('');
  if (metadata.private !== false || metadata.visibility !== 'public') fail('ACTION_ACCESS', 'Profile 需要调用公开工具仓库中的 Action。');
  const file = await readPublic('/contents/action.yml?ref=main');
  if (file.type !== 'file' || file.encoding !== 'base64' || typeof file.content !== 'string') {
    fail('ACTION_ACCESS', '工具仓库 main 上缺少 action.yml。');
  }
  const action = Buffer.from(file.content, 'base64').toString('utf8');
  if (!/^\s*using:\s*['"]?composite['"]?\s*$/mu.test(action)) fail('ACTION_ACCESS', '工具仓库 main 上的 action.yml 必须是组合 Action。');
}

export function profileWorkflow(template, { branch, timezone, repository }) {
  if (!repositoryPattern.test(repository)) fail('CONFIG', '工具仓库地址无效。');
  // JSON 字符串也是安全的 YAML 标量；配置不进入 shell 命令。
  return template.replaceAll('__BRANCH__', JSON.stringify(branch))
    .replaceAll('__TIMEZONE__', JSON.stringify(timezone))
    .replaceAll('__TOOL_REPOSITORY__', repository)
    .replaceAll('__DATA_PATH__', DATA_PATH)
    .replaceAll('__DISPLAY_CONFIG_PATH__', DISPLAY_CONFIG_PATH)
    .replaceAll('__WORKFLOW_PATH__', WORKFLOW_PATH);
}

export function setupDocuments({ repository }, branch, actionRepository) {
  return {
    'README-snippet.md': `## 我的 Codex 活动\n\n![Codex 活动](./${SVG_PATH})\n`,
    'README-snippet.en.md': `## My Codex Activity\n\n![Codex Activity](./${SVG_PATH})\n`,
    'SETUP.md': [
      '# Profile 接入', '',
      '**简体中文（默认）** | [English](./SETUP.en.md)', '',
      `目标仓库：${repository}；默认分支：${branch}。`, '',
      `1. 将 [codex-activity.yml](./codex-activity.yml) 放入目标仓库 ${WORKFLOW_PATH}，提交并推送到默认分支。`,
      '2. 首次接入时，将 [README-snippet.md](./README-snippet.md) 中的内容加入 Profile README。',
      '3. 回到本机工具目录运行 npm run sync，等待 Profile Actions 生成图片。无需创建空 JSON 或配置仓库 Secrets。', '',
      `工具引用：${actionRepository}@main。后续兼容更新会在下次 Actions 运行时自动采用，无需再次替换工作流。旧版接入只需按第 1 步迁移一次。`, '',
      '可在本机 .env 用 TOOL_REPOSITORY=owner/repo 指定公开上游，留空使用包信息中的默认仓库。上游 main 必须提供兼容的组合 Action。修改后需重新运行 npm run setup，替换并提交 Profile 工作流；npm run sync 不更新工作流。', '',
      '日常在本机 .env 设置 ACTIVITY_THEME、ACTIVITY_LANGUAGE 后运行 npm run sync；主题和语言之外的本机配置不会上传。修改时区后需重新 setup 并替换工作流。不要复制 .env。',
      '统计和显示配置都无变化时，不触发新的运行；需要立即重绘可在 Actions → Codex Activity 选择 Run workflow。最后更新时间表示统计上传时间，不是图片重绘时间。', '',
    ].join('\n'),
    'SETUP.en.md': [
      '# Profile integration', '',
      '[简体中文（默认）](./SETUP.md) | **English**', '',
      `Target repository: ${repository}; default branch: ${branch}.`, '',
      `1. Place [codex-activity.yml](./codex-activity.yml) at ${WORKFLOW_PATH} in the target repository, then commit and push to its default branch.`,
      '2. For the first integration, add [README-snippet.en.md](./README-snippet.en.md) to the Profile README.',
      '3. Return to the local tool directory and run npm run sync, then wait for Profile Actions to generate the image. No empty JSON or repository Secrets are needed.', '',
      `Action reference: ${actionRepository}@main. Later compatible updates are used on the next Actions run without replacing the workflow. Existing integrations need step 1 only once to migrate.`, '',
      'Set TOOL_REPOSITORY=owner/repo in your local .env to select a public upstream, or leave it empty to use the package default. Its main branch must provide a compatible composite Action. After changing it, rerun npm run setup, then replace and commit the Profile workflow; npm run sync does not update the workflow.', '',
      'For everyday use, set ACTIVITY_THEME and ACTIVITY_LANGUAGE in your local .env and run npm run sync; other local settings are not uploaded. Timezone changes require setup and workflow replacement. Do not copy .env.',
      'If statistics and display settings are unchanged, no new run is triggered. For an immediate redraw, choose Run workflow in Actions → Codex Activity. Last updated means statistics upload time, not image redraw time.', '',
    ].join('\n'),
  };
}

export async function generateSetup(config, branch, outputDirectory = join(process.cwd(), 'generated')) {
  // 配置入口已完成格式校验；公开检查和所有接入材料使用同一个最终地址。
  const repository = config.toolRepository ?? await toolRepository();
  await verifyAction(repository);
  const template = await readFile(join(projectRoot, 'templates', 'profile', 'codex-activity.yml'), 'utf8');
  const workflow = profileWorkflow(template, { branch, timezone: config.timezone, repository });
  // 公开检查通过后再生成文件，避免失败时留下看似可用的新入口。
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, 'codex-activity.yml'), workflow);
  for (const [name, contents] of Object.entries(setupDocuments(config, branch, repository))) {
    await writeFile(join(outputDirectory, name), contents);
  }
  return { repository, outputDirectory };
}
