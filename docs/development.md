# 开发与发布

**简体中文（默认）** | [English](./development.en.md) | [返回首页](../README.md)

## 项目结构

```text
.
├── README.md / README.en.md       # 中文默认入口与英文入口
├── docs/                         # 按主题配对的中英文文档
├── src/                          # CLI、采集、上传和渲染实现
├── tests/                        # Node 内置测试与合成数据助手
├── scripts/                      # 合成示例生成、发布元数据准备
├── templates/                    # Profile 工作流模板、固定发布信息
├── examples/                     # 文档引用的中英文深色与浅色 SVG 示例
├── .github/workflows/             # CI 检查与可复用渲染工作流
├── .env.example                  # 不含凭据的双语配置样例
├── package.json                  # 命令、Node 版本和发布白名单
└── LICENSE                       # MIT 许可证原文
```

本机的 `.env`、`.idea/` 和 `generated/` 被忽略，不属于发布源文件。

| 模块 | 职责 |
| --- | --- |
| `src/cli.mjs` | `setup`、`status`、`sync` 命令编排 |
| `src/config.mjs`、`src/errors.mjs` | 配置白名单、路径常量、安全错误信息 |
| `src/collector.mjs` | 发现 Codex，通过 App Server 读取统计 |
| `src/data.mjs`、`src/state.mjs` | 公开数据规范化、历史合并、待上传缓存和进程锁 |
| `src/github.mjs`、`src/git.mjs` | GitHub Contents API、冲突恢复、Git 子进程封装 |
| `src/setup.mjs` | 固定版本验证、Profile 工作流与双语材料生成 |
| `src/render.mjs`、`src/ci.mjs` | SVG 渲染、上传时间查询、Actions 内发布 |

数据流：本机 Codex → 白名单统计 → 合并本地缓存和远程历史 → Profile JSON → Actions → Profile SVG。定时 Actions 不连接本机或 Codex。

## 开发验证

使用 Node.js **24.10+** 和 Git，无需安装依赖。

```powershell
npm test
npm run render:example
npm pack --dry-run
```

四组测试分别覆盖秘密保护与接入材料、历史与去重、统计与显示配置上传恢复、双语图表及上传时间。测试使用合成数据和模拟网络，不需要 `.env` 或真实凭据。`render:example` 使用固定日期和合成数据，重建四张中英文、深浅色文档示例。

修改文档时同步更新同主题中英文文件，检查语言切换、相对链接和命令。`README.md` 及不含 `.en` 的文件始终为中文默认入口。MIT 许可证保留原文。

## 文件保留与清理

| 文件类型 | 处理规则 |
| --- | --- |
| `src/`、`tests/`、`scripts/`、`templates/`、工作流 | 保留；均参与实现、验证或发布，不因 README 未直接引用而删除 |
| `examples/*.svg` | 保留并提交，供文档直接展示；通过 `npm run render:example` 重建 |
| `.env` | 本机凭据，保留并忽略，不能随项目清理误删 |
| `.idea/` | 本机 IDE 设置，保留并整体忽略 |
| `generated/` | 本机接入材料，保留并忽略；可用 `npm run setup` 重新生成 |
| `*.tgz` | 本地打包产物，默认忽略；不再需要的旧包可删除，按需 `npm pack` 重建 |
| `node_modules/`、`.cache/`、`coverage/`、`dist/`、日志 | 生成或临时文件，默认忽略；确认无待用内容后可清理 |
| 用户数据目录中的待上传缓存 | 保留；可能包含尚未上传的历史，不作为普通缓存清理 |

npm 使用 `package.json` 的 `files` 白名单，只包含运行源码、发布准备脚本、模板、示例、双语文档、`.env.example` 和许可证。测试、IDE 设置、本机接入材料和真实 `.env` 不进入包。

## 发布流程

当前工具仓库为 `Lancasteerr/my-codex-activity`。若更换仓库，需同时修改 `package.json` 中的 repository 和 `.github/workflows/render.yml` 中渲染代码的 checkout 仓库，再准备发布。

1. 完成验证并提交实现和文档，确保工作区干净。
2. 在干净工作区运行发布脚本，将 `templates/release.json` 的 `ref` 固定到刚提交的实现版本，再提交元数据：

   ```powershell
   node scripts/release.mjs
   git add templates/release.json
   git commit -m "chore: pin release source revision"
   npm pack --dry-run
   ```

   `node scripts/release.mjs` 只更新本机元数据，不提交、不推送，也不更新 Profile。元数据提交的 SHA 与其中记录的实现 SHA 不同是正常的；应确认被引用的实现包含所需功能。

3. 检查打包清单，需要本地包时执行 `npm pack`。将实现提交和元数据提交一起推送到公开工具仓库；当前默认分支为 `main`：

   ```powershell
   git push origin main
   git ls-remote origin refs/heads/main
   ```

   对照 `git log -1 --format=%H`，确认远程分支已收到最新提交。`git status -sb` 仍显示 `ahead` 时，提交尚未推送。若分发 npm 包或源码包，也需重新打包并发布，避免用户取得旧元数据。发布脚本不会自动执行这些操作。
4. 使用 `setup` 前，必须先将引用的实现提交推送到公开工具仓库。`setup` 会匿名检查仓库公开性、固定提交内的 `workflow_call` 入口以及内部 checkout 仓库是否一致；失败时不生成新的材料。
5. 按[升级到新版脚本](./usage.md#升级到新版脚本)运行 `setup`，核对生成入口的 `uses` 和 `tool_ref` 都等于发布元数据中的 `ref`，再替换 Profile 工作流、提交并推送到默认分支。在 Profile Actions 确认升级提交触发了新运行，不能仅以本机生成成功作为升级完成的依据。

`templates/release.json` 指向完整实现提交 SHA，供没有 `.git` 的包安装目录使用。有合法元数据时 `setup` 优先使用该固定版本，不会自动切换到工作区最新更改。元数据不可用时才尝试当前 Git 提交，不使用可变分支或标签作为版本引用。

例如，代码已包含中文渲染而 `ref` 仍指向不支持语言配置的旧提交时，`setup` 可以成功，却仍生成旧渲染器引用。必须先更新并发布元数据，再重新 `setup`；只推送实现或修改文档不会更新这个指针。

## 参考

- [Codex App Server 与 account/usage/read](https://learn.chatgpt.com/docs/app-server)
- [GitHub Contents API 与细粒度 Token 权限](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents)
- [GitHub 可复用工作流](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)
- [GITHUB_TOKEN 及触发行为](https://docs.github.com/en/actions/concepts/security/github_token)
- [GitHub schedule 行为与限制](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
