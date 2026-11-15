import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { fail } from './errors.mjs';

export const DATA_PATH = 'data/codex/usage.json';
export const DISPLAY_CONFIG_PATH = 'data/codex/config.json';
export const SVG_PATH = 'assets/codex-activity.svg';
export const WORKFLOW_PATH = '.github/workflows/codex-activity.yml';

export function normalizeDisplayConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('CONFIG', '显示配置必须是包含 theme 和 language 的对象。');
  if (!['github-dark', 'github-light'].includes(value.theme)) fail('CONFIG', 'ACTIVITY_THEME 必须是 github-dark 或 github-light。');
  if (!['en', 'zh-CN'].includes(value.language)) fail('CONFIG', 'ACTIVITY_LANGUAGE 必须是 en 或 zh-CN。');
  return { theme: value.theme, language: value.language };
}

export async function readConfig(envFile = '.env') {
  let values;
  try {
    values = parseEnv(await readFile(resolve(envFile), 'utf8'));
  } catch {
    fail('CONFIG', '无法读取配置。请复制 .env.example 为 .env 并填写，或用 --env-file 指定文件。');
  }
  const token = values.GITHUB_TOKEN?.trim();
  const repository = values.GITHUB_REPOSITORY?.trim();
  if (!token || /[\s\x00-\x1f\x7f]/u.test(token)) {
    fail('CONFIG', '请在配置文件中填写有效的 GITHUB_TOKEN；不要在命令行传入 Token。');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/u.test(repository ?? '') || repository === 'your-name/your-name') {
    fail('CONFIG', 'GITHUB_REPOSITORY 必须是现有仓库的 owner/repo，不能填写 URL。');
  }
  const timezone = values.TIMEZONE?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
  } catch {
    fail('CONFIG', 'TIMEZONE 必须是有效 IANA 时区，例如 Asia/Singapore。');
  }
  const display = normalizeDisplayConfig({
    theme: values.ACTIVITY_THEME?.trim() || 'github-dark',
    language: values.ACTIVITY_LANGUAGE?.trim() || 'en',
  });
  // Read only known keys. In particular, do not mutate process.env or propagate secrets.
  return { token, repository, timezone, ...display, codexBin: values.CODEX_BIN?.trim() || null };
}
