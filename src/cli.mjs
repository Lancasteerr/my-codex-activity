#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readConfig } from './config.mjs';
import { discoverCodex, collectUsage } from './collector.mjs';
import { GitHubClient, uploadUsage, syncDisplayConfig } from './github.mjs';
import { generateSetup } from './setup.mjs';
import { stateDirectory, acquireLock, readPending, savePending, clearPending } from './state.mjs';
import { mergeUsage } from './data.mjs';
import { formatUpload } from './render.mjs';
import { fail, safeError } from './errors.mjs';

export async function main(args = process.argv.slice(2), log = console.log) {
  let parsed;
  try {
    parsed = parseArgs({ args, allowPositionals: true, options: { 'env-file': { type: 'string' }, help: { type: 'boolean', short: 'h' } } });
  } catch { fail('ARGUMENT', '命令参数无效。支持 setup、status、sync，以及 --env-file <路径>。'); }
  const [command, ...extra] = parsed.positionals;
  if (parsed.values.help || !command) {
    log('Codex Activity\n用法：codex-activity <setup|status|sync> [--env-file <路径>]\n请复制 .env.example 为 .env，填写细粒度 Token 与目标 Profile 仓库。');
    return;
  }
  if (!['setup', 'status', 'sync'].includes(command) || extra.length) fail('ARGUMENT', '请选择 setup、status 或 sync。');
  const config = await readConfig(parsed.values['env-file']);
  const client = new GitHubClient(config);
  const directory = stateDirectory(config.repository);
  const release = command === 'sync' ? await acquireLock(directory) : async () => {};
  try {
    const codexBin = await discoverCodex(config.codexBin);
    // Collection must succeed before any remote write; account records stay private.
    const latest = await collectUsage(codexBin);
    if (command === 'sync') {
      await savePending(directory, mergeUsage(await readPending(directory), latest));
    }
    const { branch } = await client.repositoryInfo();
    if (command === 'setup') {
      await generateSetup(config, branch);
      log(`检查通过：${config.repository} (${branch})；Codex 统计可用。`);
      log('已在 generated/ 生成 codex-activity.yml，以及中英文 README 片段和接入说明；默认请阅读 SETUP.md。');
      log('请将工作流与 README 片段加入 Profile；不要复制 .env。工具引用提交须先发布到公开工具仓库。');
    } else if (command === 'status') {
      const remote = await client.readUsage(branch);
      const uploaded = remote.usage ? await client.lastUpload(branch) : null;
      log(`配置和认证可用：${config.repository} (${branch})。`);
      log(`Codex 统计可用：${Object.keys(latest.daily).length} 个每日桶。`);
      log(remote.usage ? `上次上传：${formatUpload(uploaded, config.timezone)}。` : '尚未初始化远程统计；运行 sync 自动建档。');
      log('授权信息仅从本机配置读取，未输出或复制。');
    } else {
      const result = await uploadUsage(client, {
        branch, latest, pending: await readPending(directory),
        onPending: usage => savePending(directory, usage),
      });
      await clearPending(directory);
      if (result.changed) {
        log(result.confirmed ? '已确认数据上传成功；图表等待 Actions 更新。' : '数据已上传；图表等待 Actions 更新。');
      } else {
        log('数据无变化，未上传。');
      }
      try {
        const display = await syncDisplayConfig(client, { branch, theme: config.theme, language: config.language });
        log(display.changed ? '显示配置已同步；图表等待 Actions 更新。' : '显示配置无变化。');
      } catch (error) {
        log('统计同步已完成；显示配置同步失败，修复错误后再次运行 sync 即可补齐。');
        throw error;
      }
      // A metadata lookup failure must not turn a completed upload into a failure.
      try { log(`上次上传：${formatUpload(await client.lastUpload(branch), config.timezone)}。`); }
      catch { log('暂时无法读取上传时间；可稍后运行 status 查看。'); }
    }
  } finally { await release(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
}
