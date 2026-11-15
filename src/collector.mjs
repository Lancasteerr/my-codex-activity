import { access, readdir, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, delimiter, resolve, isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fail, ActivityError } from './errors.mjs';
import { fromRpc } from './data.mjs';

export async function discoverCodex(explicit = null) {
  const candidates = [];
  if (explicit) candidates.push(resolve(explicit));
  else {
    for (const directory of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
      candidates.push(join(directory.replace(/^"|"$/gu, ''), process.platform === 'win32' ? 'codex.exe' : 'codex'));
    }
    if (process.env.LOCALAPPDATA) {
      const bin = join(process.env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin');
      try {
        const entries = await readdir(bin, { withFileTypes: true });
        const versions = await Promise.all(entries.filter(entry => entry.isDirectory()).map(async entry => {
          const path = join(bin, entry.name, 'codex.exe');
          return { path, modified: (await stat(path).catch(() => null))?.mtimeMs ?? 0 };
        }));
        candidates.push(...versions.sort((a, b) => b.modified - a.modified).map(entry => entry.path));
      } catch { /* Known installation location is optional. */ }
    }
  }
  for (const path of candidates) {
    try {
      if (isAbsolute(path) && (await stat(path)).isFile()) {
        await access(path, constants.X_OK);
        return path;
      }
    } catch { /* Try the next known executable; do not print local paths. */ }
  }
  fail('CODEX_BIN', '未发现可运行的 Codex；请在 .env 的 CODEX_BIN 中填写 codex.exe 的绝对路径。');
}

export function collectorEnvironment(environment = process.env) {
  return Object.fromEntries(Object.entries(environment).filter(([key]) =>
    !/(TOKEN|SECRET|PASSWORD|COOKIE|API_KEY|AUTHORIZATION)/iu.test(key)
    && !/^(GH_|GITHUB_|NODE_OPTIONS$|DEBUG$|RUST_LOG$|RUST_BACKTRACE$|OTEL_)/iu.test(key)));
}

export async function collectUsage(codexBin, { timeoutMs = 30_000 } = {}) {
  const child = spawn(codexBin, ['app-server', '--listen', 'stdio://'], {
    shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: collectorEnvironment(),
  });
  // Neither stderr nor unsolicited notifications are ever forwarded to a log.
  child.stderr.resume();
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const pending = new Map();
  let nextId = 0;
  let closed = false;
  const rejectAll = error => {
    closed = true;
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
    pending.clear();
  };
  child.stdin.on('error', () => rejectAll(new ActivityError('CODEX_IO', 'Codex 统计连接已中断。')));
  child.stdout.on('error', () => rejectAll(new ActivityError('CODEX_IO', 'Codex 统计连接已中断。')));
  child.stderr.on('error', () => {});
  lines.on('error', () => rejectAll(new ActivityError('CODEX_IO', 'Codex 统计连接已中断。')));
  child.on('error', () => rejectAll(new ActivityError('CODEX_START', '无法启动 Codex 运行时。')));
  child.on('exit', () => rejectAll(new ActivityError('CODEX_EXIT', 'Codex 运行时已退出；请检查版本和登录状态。')));
  lines.on('line', line => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    const request = pending.get(message?.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new ActivityError('CODEX_RPC', 'Codex 未能读取统计；请检查运行时兼容性及登录状态。'));
    else request.resolve(message.result);
  });
  const send = message => child.stdin.write(`${JSON.stringify(message)}\n`);
  const request = (method, params = {}) => new Promise((resolveRequest, reject) => {
    if (closed) { reject(new ActivityError('CODEX_EXIT', 'Codex 运行时不可用。')); return; }
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new ActivityError('CODEX_TIMEOUT', '读取 Codex 统计超时；未上传。'));
    }, timeoutMs);
    pending.set(id, { resolve: resolveRequest, reject, timer });
    send({ id, method, params });
  });
  try {
    await request('initialize', {
      clientInfo: { name: 'codex_activity', title: 'Codex Activity', version: '0.1.0' },
      capabilities: { experimentalApi: true },
    });
    send({ method: 'initialized' });
    const account = await request('account/read', { refreshToken: false });
    if (!account?.account) fail('CODEX_AUTH', 'Codex 尚未登录；请在原应用中完成登录。');
    return fromRpc(await request('account/usage/read'));
  } finally {
    rejectAll(new ActivityError('CODEX_CLOSED', '统计读取连接已关闭。'));
    lines.close();
    child.stdin.end();
    if (child.exitCode === null) child.kill();
  }
}
