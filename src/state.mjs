import { mkdir, readFile, writeFile, rename, unlink, open, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fail } from './errors.mjs';
import { normalizeUsage, serializeUsage } from './data.mjs';

export function stateDirectory(repository) {
  const base = process.env.LOCALAPPDATA || join(homedir(), '.local', 'state');
  const id = createHash('sha256').update(repository).digest('hex').slice(0, 16);
  return join(base, 'codex-activity', id);
}

export async function readPending(directory) {
  try { return normalizeUsage(JSON.parse(await readFile(join(directory, 'pending.json'), 'utf8'))); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    fail('CACHE', '待上传缓存无效；请检查本地 codex-activity 数据目录后重试。');
  }
}

export async function savePending(directory, usage) {
  try {
    await mkdir(directory, { recursive: true });
    const path = join(directory, 'pending.json');
    const temp = `${path}.${process.pid}.tmp`;
    await writeFile(temp, serializeUsage(usage), { mode: 0o600 });
    await rename(temp, path);
  } catch { fail('CACHE', '无法保存清洗后的统计缓存；未继续上传。'); }
}

export async function clearPending(directory) {
  try { await unlink(join(directory, 'pending.json')); }
  catch (error) { if (error.code !== 'ENOENT') fail('CACHE', '上传已完成，但缓存清理失败；下次将重新确认远程数据。'); }
}

export async function acquireLock(directory) {
  await mkdir(directory, { recursive: true });
  const path = join(directory, 'sync.lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(path, 'wx', 0o600);
      await handle.writeFile(String(process.pid));
      return async () => { await handle.close(); await unlink(path).catch(() => {}); };
    } catch (error) {
      if (error.code !== 'EEXIST') fail('LOCK', '无法创建同步锁。');
      try {
        const pid = Number(await readFile(path, 'utf8'));
        if (!Number.isSafeInteger(pid) || pid <= 0) {
          // An empty just-created lock may be between create and write.
          if (Date.now() - (await stat(path)).mtimeMs < 60_000) fail('LOCK', '另一次同步正在启动，请稍后重试。');
        } else {
          try { process.kill(pid, 0); fail('LOCK', '另一次同步正在运行。'); }
          catch (probe) { if (probe.code !== 'ESRCH') throw probe; }
        }
        await unlink(path);
      } catch (probe) {
        if (probe.code === 'ENOENT') continue;
        if (probe.code === 'LOCK') throw probe;
        fail('LOCK', '无法确认同步锁状态，请稍后重试。');
      }
    }
  }
  fail('LOCK', '无法取得同步锁，请稍后重试。');
}
