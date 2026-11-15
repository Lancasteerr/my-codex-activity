import { readFile, writeFile, mkdir, realpath, lstat } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DATA_PATH, SVG_PATH } from './config.mjs';
import { normalizeUsage } from './data.mjs';
import { renderSvg } from './render.mjs';
import { git } from './git.mjs';
import { fail, safeError } from './errors.mjs';

function within(root, target) {
  const path = relative(root, target);
  return path !== '..' && !path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(path);
}

async function safeFile(root, name, { createParent = false } = {}) {
  const target = resolve(root, name);
  if (!within(root, target)) fail('RENDER', '输出路径超出工作区。');
  // Check every parent before creating directories; do not follow Profile symlinks.
  let cursor = root;
  const segments = relative(root, dirname(target)).split(/[\\/]/u).filter(Boolean);
  for (const segment of [...segments, target.slice(dirname(target).length + 1)]) {
    cursor = join(cursor, segment);
    try { if ((await lstat(cursor)).isSymbolicLink()) fail('RENDER', '统计或输出路径不能是符号链接。'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (createParent) await mkdir(dirname(target), { recursive: true });
  return target;
}

export async function buildSvg(directory, { timezone = 'UTC', theme = 'github-dark', now = new Date() } = {}) {
  const root = await realpath(directory);
  const input = await safeFile(root, DATA_PATH);
  let text;
  try { text = await readFile(input, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  if (text.length > 2_000_000) fail('RENDER', '统计文件过大。');
  let usage;
  try { usage = normalizeUsage(JSON.parse(text)); } catch { fail('RENDER', '统计 JSON 无效；未修改图表。'); }
  const lastUpdated = await git(root, ['log', '-1', '--format=%cI', '--', DATA_PATH]);
  if (!lastUpdated) fail('RENDER', '未找到统计上传提交；请检出完整历史。');
  const svg = renderSvg(usage, { lastUpdated, timezone, theme, now });
  const output = await safeFile(root, SVG_PATH, { createParent: true });
  await writeFile(output, svg);
  return true;
}

export async function publishSvg(directory, options = {}) {
  const root = await realpath(directory);
  if (process.env.GITHUB_ACTIONS !== 'true' || !process.env.GITHUB_WORKSPACE
    || root !== await realpath(join(process.env.GITHUB_WORKSPACE, 'profile'))) {
    fail('RENDER', '发布命令只能在 Actions 专用的 profile checkout 中运行。');
  }
  const defaultBranch = options.branch;
  if (typeof defaultBranch !== 'string' || !defaultBranch) fail('RENDER', '缺少默认分支。');
  const token = options.token;
  if (!token) fail('RENDER', '缺少 Actions 临时凭据。');
  const expectedOrigin = `https://github.com/${options.repository}`;
  const origin = (await git(root, ['remote', 'get-url', 'origin'])).replace(/\.git$/u, '');
  if (origin !== expectedOrigin) fail('RENDER', '发布远程必须是当前调用者的 GitHub 仓库。');
  const header = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
  const environment = {
    GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader', GIT_CONFIG_VALUE_0: header,
    GIT_CONFIG_KEY_1: 'http.followRedirects', GIT_CONFIG_VALUE_1: 'false',
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    await git(root, ['fetch', 'origin', `+refs/heads/${defaultBranch}:refs/remotes/origin/${defaultBranch}`], environment);
    // This runs only in the disposable Actions checkout. Retry from the current branch.
    await git(root, ['reset', '--hard', `refs/remotes/origin/${defaultBranch}`]);
    if (!await buildSvg(root, options)) return 'no-data';
    await git(root, ['add', '--', SVG_PATH]);
    const staged = await git(root, ['diff', '--cached', '--name-only']);
    if (staged && staged !== SVG_PATH) fail('RENDER', '暂存区包含非 SVG 文件；停止发布。');
    try {
      await git(root, ['diff', '--cached', '--quiet']);
      return 'unchanged';
    } catch (error) { if (error.exitCode !== 1) throw error; }
    await git(root, ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-m', 'Update Codex activity chart']);
    try {
      await git(root, ['push', 'origin', `HEAD:refs/heads/${defaultBranch}`], environment);
      return 'published';
    } catch (error) { if (attempt === 2) throw error; }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode, directory] = process.argv.slice(2);
  const options = { timezone: process.env.ACTIVITY_TIMEZONE || 'UTC', theme: process.env.ACTIVITY_THEME || 'github-dark' };
  const task = mode === 'publish'
    ? publishSvg(directory, { ...options, branch: process.env.ACTIVITY_BRANCH, repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN })
    : mode === 'build' && directory ? buildSvg(directory, options) : Promise.reject(new Error());
  Promise.resolve(task).then(result => console.log(`Codex Activity: ${result || 'no-data'}`))
    .catch(error => { console.error(safeError(error)); process.exitCode = 1; });
}
