import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ActivityError } from './errors.mjs';

const execute = promisify(execFile);

export async function git(directory, args, environment = {}) {
  try {
    const { stdout } = await execute('git', ['-C', directory, ...args], {
      windowsHide: true, timeout: 30_000, maxBuffer: 2_000_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_TRACE: '0', GIT_TRACE_CURL: '0', GIT_TRACE_PACKET: '0', GIT_CURL_VERBOSE: '0', ...environment },
    });
    return stdout.trim();
  } catch (error) {
    const safe = new ActivityError('GIT', 'Git 操作失败；原始输出已隐藏。');
    safe.exitCode = typeof error.code === 'number' ? error.code : null;
    throw safe;
  }
}
