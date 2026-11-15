import { DATA_PATH } from './config.mjs';
import { ActivityError, fail } from './errors.mjs';
import { normalizeUsage, mergeUsage, sameUsage, serializeUsage } from './data.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export class GitHubError extends ActivityError {
  constructor(status) {
    const messages = {
      0: 'GitHub 请求超时或网络不可用。',
      401: 'GitHub Token 无效或已过期，请在 .env 中更新。',
      403: 'GitHub 拒绝请求；请检查 Token 的目标仓库、Contents 权限、限流及仓库策略。',
      404: 'GitHub 仓库、分支或文件不存在，或当前 Token 无权访问。',
      409: '远程内容发生变化，需要重新读取。',
      422: 'GitHub 未接受更新；请检查仓库规则及当前文件版本。',
      429: 'GitHub 请求已限流，请稍后重试。',
    };
    super(`GITHUB_${status}`, messages[status] ?? 'GitHub 暂时无法完成请求。');
    this.status = status;
  }
}

const transient = error => error instanceof GitHubError && (error.status === 0 || error.status >= 500);

export class GitHubClient {
  #token;
  constructor({ token, repository, fetchImpl = fetch, sleep = pause }) {
    if (!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/u.test(repository)) fail('CONFIG', '目标仓库无效。');
    this.#token = token;
    this.repository = repository;
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
    this.base = `/repos/${repository.split('/').map(encodeURIComponent).join('/')}`;
  }

  async request(path, { method = 'GET', body } = {}) {
    if (!path.startsWith(`${this.base}/`) && path !== this.base) fail('GITHUB', '请求超出目标仓库。');
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await this.fetchImpl(`https://api.github.com${path}`, {
          method, redirect: 'error', signal: AbortSignal.timeout(30_000),
          headers: {
            Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.#token}`,
            'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'codex-activity/0.1.0',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        if (!response.ok) {
          // Discard API error bodies: never interpolate upstream messages into logs.
          await response.body?.cancel();
          throw new GitHubError(response.status);
        }
        const text = await response.text();
        if (text.length > 3_000_000) fail('GITHUB', '远程响应过大；操作已停止。');
        try { return JSON.parse(text); } catch { fail('GITHUB', 'GitHub 返回了无效数据。'); }
      } catch (error) {
        const safe = error instanceof ActivityError ? error : new GitHubError(0);
        if (method === 'GET' && transient(safe) && attempt < 2) {
          await this.sleep(500 * 2 ** attempt);
          continue;
        }
        throw safe;
      }
    }
  }

  async repositoryInfo() {
    const repo = await this.request(this.base);
    if (!repo.default_branch || typeof repo.default_branch !== 'string') fail('GITHUB', '目标仓库没有默认分支，请先添加 README。');
    await this.request(`${this.base}/branches/${encodeURIComponent(repo.default_branch)}`);
    return { branch: repo.default_branch };
  }

  async readUsage(branch) {
    try {
      const file = await this.request(`${this.base}/contents/${DATA_PATH}?ref=${encodeURIComponent(branch)}`);
      if (file.type !== 'file' || file.encoding !== 'base64' || !/^[a-f0-9]{40}$/u.test(file.sha ?? '') || typeof file.content !== 'string') {
        fail('DATA', '远程统计文件无法安全读取。');
      }
      let parsed;
      try { parsed = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')); }
      catch { fail('DATA', '远程统计 JSON 无效；未覆盖现有文件。'); }
      return { usage: normalizeUsage(parsed), sha: file.sha };
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) return { usage: null, sha: null };
      throw error;
    }
  }

  async writeUsage(branch, usage, sha) {
    const result = await this.request(`${this.base}/contents/${DATA_PATH}`, {
      method: 'PUT',
      body: {
        message: 'Update Codex activity data', branch,
        content: Buffer.from(serializeUsage(usage)).toString('base64'), ...(sha ? { sha } : {}),
      },
    });
    return result.commit?.committer?.date ?? null;
  }

  async lastUpload(branch) {
    const commits = await this.request(`${this.base}/commits?path=${encodeURIComponent(DATA_PATH)}&sha=${encodeURIComponent(branch)}&per_page=1`);
    const value = commits[0]?.commit?.committer?.date;
    return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null;
  }
}

export async function uploadUsage(client, { branch, latest, pending = null, onPending = async () => {} }) {
  // repositoryInfo must have confirmed access before a file 404 can mean initialization.
  let candidate;
  let ambiguous = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const remote = await client.readUsage(branch);
    candidate = mergeUsage(remote.usage, pending, latest);
    await onPending(candidate);
    if (sameUsage(remote.usage, candidate)) return { changed: ambiguous, confirmed: ambiguous, usage: candidate };
    try {
      await client.writeUsage(branch, candidate, remote.sha);
      return { changed: true, confirmed: false, usage: candidate };
    } catch (error) {
      const retryable = transient(error) || (error instanceof GitHubError && error.status === 409);
      if (!retryable) throw error;
      // A timed-out PUT may already have committed. Read before any repeated PUT.
      ambiguous ||= transient(error);
      const confirmed = await client.readUsage(branch);
      if (sameUsage(confirmed.usage, candidate)) return { changed: true, confirmed: true, usage: candidate };
      if (attempt === 2) throw error;
      await client.sleep(500 * 2 ** attempt);
    }
  }
}
