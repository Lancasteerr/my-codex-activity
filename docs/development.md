# 开发与发布

**简体中文（默认）** | [English](./development.en.md) | [返回首页](../README.md)

## 项目结构

```text
.
├── README.md / README.en.md       # 中文默认入口与英文入口
├── docs/                         # 按主题配对的中英文文档
├── src/                          # CLI、采集、上传和渲染实现
├── tests/                        # Node 内置测试与合成数据助手
├── scripts/                      # 合成示例生成
├── templates/                    # Profile 工作流模板
├── examples/                     # 文档引用的中英文深色与浅色 SVG 示例
├── .github/workflows/             # CI 检查工作流
├── action.yml                    # 跟随 main 的组合 Action 入口
├── .env.example                  # 不含凭据的双语配置样例
├── package.json                  # 命令、Node 版本和发布白名单
└── LICENSE                       # MIT 许可证原文
```

本机的 `.env`、`.idea/` 和 `generated/` 被忽略，不属于发布源文件。

| 模块 | 职责 |
| --- | --- |
| `src/cli.mjs` | `setup`、`status`、`sync` 命令编排 |
| `src/chart-options.mjs`、`src/config.mjs` | 主题、语言、默认值、配置校验及路径常量 |
| `src/errors.mjs` | 安全错误信息 |
| `src/collector.mjs` | 发现 Codex，通过 App Server 读取统计 |
| `src/data.mjs`、`src/state.mjs` | 公开数据规范化、历史合并、待上传缓存和进程锁 |
| `src/github.mjs`、`src/git.mjs` | GitHub Contents API、冲突恢复、Git 子进程封装 |
| `src/setup.mjs` | 公开 Action 检查、Profile 工作流与双语材料生成 |
| `src/render.mjs`、`src/ci.mjs` | SVG 渲染、上传时间查询、Actions 内发布 |

数据流：本机 Codex → 白名单统计 → 合并本地缓存和远程历史 → Profile JSON → Actions → Profile SVG。定时 Actions 不连接本机或 Codex。

## 开发验证

使用 Node.js **24.10+** 和 Git，无需安装依赖。

```powershell
npm test
npm run render:example
npm pack --dry-run
```

测试覆盖秘密保护与接入材料、上游配置与公开 Action 检查、历史与去重、统计与显示配置上传恢复、双语图表及上传时间。测试使用合成数据和模拟网络，不需要 `.env` 或真实凭据。`render:example` 使用固定日期和合成数据，重建四张中英文、深浅色文档示例。

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

npm 使用 `package.json` 的 `files` 白名单，只包含运行源码、Action 入口、模板、示例、双语文档、`.env.example` 和许可证。测试、IDE 设置、本机接入材料和真实 `.env` 不进入包。

## 发布流程

默认工具仓库地址在 `package.json` 的 `repository` 中维护，本机 `.env` 的 `TOOL_REPOSITORY` 可覆盖该地址。`setup` 检查选定仓库公开且 `main` 提供组合 Action，统一生成 `<工具仓库>@main` 和双语接入说明；Action 直接运行自身代码，无需维护第二个源码仓库地址。切换上游后须重新 `setup`，替换并提交 Profile 工作流，`sync` 不修改入口。未填写配置的现有用户继续跟踪默认仓库 `main` 的最新提交。

1. 执行开发验证，提交实现和对应文档。
2. 将兼容更新推送到公开工具仓库的 `main`；`action.yml` 和运行源码随同一个提交发布。
3. 已迁移的 Profile 在下一次 Actions 运行自动使用更新，不需要额外的发布指针或元数据提交。首次发布 Action 后，旧接入按[升级到新版脚本](./usage.md#升级到新版脚本)替换一次工作流。
4. 如需分发源码包，使用 `npm pack`；发布 npm 包时按需更新包版本。包版本不参与 Actions 选版。

本地修改默认在 `master` 分支完成；发布目标仍是远程 `main`。例如确认改动后执行 `git push origin master:main`；推送应为正常快进更新，不强推。

跟随 `main` 意味着兼容更新会自动生效，因此提交前保持现有测试和 Action 输入兼容。旧工作流引用的历史提交仍可访问。迁移不会重写统计历史，也不会改变上传时间语义。

## 参考

- [Codex App Server 与 account/usage/read](https://learn.chatgpt.com/docs/app-server)
- [GitHub Contents API 与细粒度 Token 权限](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents)
- [GitHub 组合 Action](https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax#runs-for-composite-actions)
- [GITHUB_TOKEN 及触发行为](https://docs.github.com/en/actions/concepts/security/github_token)
- [GitHub schedule 行为与限制](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
