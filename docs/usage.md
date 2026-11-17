# 使用指南

**简体中文（默认）** | [English](./usage.en.md) | [返回首页](../README.md)

首次接入见[快速开始](../README.md#快速开始)。凭据和公开数据边界见[隐私与凭据](./security.md)。

## 配置

| 配置 | 必填 | 说明 |
| --- | --- | --- |
| `GITHUB_TOKEN` | 是 | 仅选择目标仓库、具有 Contents 读写权限的细粒度 Token |
| `GITHUB_REPOSITORY` | 是 | 已存在的 `owner/repo`，使用默认分支；不能填写 URL |
| `TOOL_REPOSITORY` | 否 | 公开上游 `owner/repo`，固定跟踪 `main`；留空使用包信息中的 `Lancasteerr/my-codex-activity` |
| `CODEX_BIN` | 否 | `codex.exe` 的绝对路径；留空自动发现 |
| `TIMEZONE` | 否 | IANA 显示时区，如 `Asia/Singapore`；留空读取本机时区 |
| `ACTIVITY_THEME` | 否 | `github-dark`（默认）或 `github-light`；下次 `sync` 自动应用 |
| `ACTIVITY_LANGUAGE` | 否 | `en`（默认）或 `zh-CN`；下次 `sync` 自动应用 |

主题和语言留空时使用默认值，其他值会在联网前报错。这两项仅控制图片语言和外观；文档及 CLI 语言不受影响。

`TOOL_REPOSITORY` 仅接受仓库地址，不能填写 URL、`@分支`、标签或提交 SHA；格式无效时在联网前报错。自定义仓库须公开，并在 `main` 提供兼容的组合 Action。修改后运行 `npm run setup`，将新工作流替换到 Profile 仓库并提交、推送；`npm run sync` 不更新工作流。留空可恢复默认上游，同样需要重新生成并替换入口。

默认只读取当前工作目录的 `.env`，不搜索父目录，不静默使用进程环境中的其他 Token。可显式指定配置文件：

```powershell
npm run sync -- --env-file C:\private\codex-activity.env
```

## 命令与接入材料

| 命令 | 行为 |
| --- | --- |
| `npm run setup` | 检查 Codex 统计和仓库访问，检查公开 Action，在 `generated/` 生成材料；不修改远程仓库或 `.env` |
| `npm run status` | 检查采集与 GitHub 读取权限，显示最近上传时间；不写远程内容 |
| `npm run sync` | 同步统计历史，再同步主题和语言；各文件有变化才上传 |
| `node src/cli.mjs --help` | 显示命令帮助，无需配置或网络访问 |

`setup` 生成的文件：

| 文件 | 用途 |
| --- | --- |
| `codex-activity.yml` | 复制到 Profile 仓库 `.github/workflows/` 的工作流入口 |
| `README-snippet.md` / `README-snippet.en.md` | 中文默认 / 英文 Profile README 片段，选择一个使用 |
| `SETUP.md` / `SETUP.en.md` | 中文默认 / 英文接入说明，保留在本机参考 |

已有旧版材料时，运行新版 `setup` 可补齐双语说明。`setup` 和 `status` 不验证实际写入，首次 `sync` 才能最终验证写入权限。成功上传和无变化均返回退出码 0，失败返回 1。上传成功表示 JSON 已提交，SVG 仍需等待 Actions 完成。

目前只支持单机、单账户手动同步，不提供本地定时任务或多设备、多账户合并。更换账户时应建立独立历史。

## 升级到新版脚本

旧版接入只需迁移一次：

1. 在本机工具目录获取新版；Git 安装运行 `git pull --ff-only`，源码包安装换用新版包，并保留自己的 `.env`。
2. 运行 `npm run setup`，将新生成的 `generated/codex-activity.yml` 完整替换到 **Profile 仓库**的 `.github/workflows/codex-activity.yml`，提交并推送到默认分支。新入口只引用一个 `<工具仓库>@main` Action。
3. 在工具目录运行 `npm run sync`，到 Profile 的 **Actions → Codex Activity** 查看结果。工作流入口变更本身也会触发一次重绘。

迁移完成后：

- **渲染代码更新**：维护者推送兼容代码到工具仓库 `main`，下一次 Actions 运行自动采用，无需重新 `setup`。推送工具仓库本身不会立即触发 Profile 重绘。
- **本机脚本更新**：Git 安装运行 `git pull --ff-only`；源码包安装换用新版包，保留 `.env`。
- **主题、语言变更**：修改 `.env` 后运行 `npm run sync`。
- **时区变更**：重新 `setup`，替换并提交 Profile 工作流，使每日调度和显示时区一起更新。
- **上游仓库变更**：修改 `.env` 中的 `TOOL_REPOSITORY`，重新 `setup`，替换并提交 Profile 工作流；每次运行使用选定仓库 `main` 的最新提交。
- **立即重绘**：在 Profile Actions 选择 `Run workflow`。统计和配置都无变化时，`sync` 不提交，也不触发新运行。

上传成功表示 JSON 已提交，图片需等待 Actions 生成。若远程 SVG 已更新而简介页仍显示旧图，可刷新并稍候图片缓存更新。`最后更新` 表示统计上传时间，不是重绘时间。

## 数据与历史

Profile 中由工具维护 `data/codex/usage.json` 和 `data/codex/config.json`，后者仅保存公开的 `theme`、`language`。Actions 只写 `assets/codex-activity.svg`。不要手工编辑统计 JSON。

- 保存接口实际返回的所有历史，不假定固定返回多少天。
- 同日使用新值覆盖，不累加；接口窗口缩短不删除已保存日期。
- 明确返回的 0 表示零用量，缺失日期表示 `unknown`；每日桶为 `null` 或采集失败时不覆盖远程文件。
- 汇总值允许 `null`，图表显示 `Unavailable` / `暂无数据`。累计 Token 使用官方汇总，不通过有限每日记录求和推算。
- 仅公开协议版本、来源标记、累计 Token、连续天数、每日 Token，以及主题和语言，不公开账户信息或原始 RPC。

## 时间、主题、语言与每日滚动

`Last updated` / `最后更新` 来自最近修改统计 JSON 的 Git 提交时间，表示最近实际上传时间。统计无变化时不上传，也不改变该时间；只修改主题或语言不会改变该时间。手工编辑统计 JSON 则会把那次提交变成新的更新时间。

工作流每天按显示时区约 **00:17** 重绘最近 52 周并更新当天标记，本机可以关机。模板使用 IANA timezone 定时设置；新加坡 00:17 等价于 UTC 前一天 16:17。GitHub 调度可能延迟，公开仓库长期无活动时定时任务可能停用。

每日重绘不查询 Codex，也不改变 `Last updated`。未上传的新日期保持 `unknown`，摘要仍是上次同步时的值。官方日期桶原样保留，显示时区不会重新拆分每日统计。

主题默认 `github-dark`，语言默认 `en`。在本机 `.env` 设置后运行 `npm run sync`：

```dotenv
ACTIVITY_THEME=github-light
ACTIVITY_LANGUAGE=zh-CN
```

即使统计无变化，`sync` 也会单独比较和上传显示配置，并触发 Actions 重绘；两者都无变化时不提交。Actions 使用 `data/codex/config.json`；文件缺失时使用默认的深色、英文，配置无效则停止发布。更新时间仍取统计文件的提交时间。

已有 Profile 按[升级到新版脚本](#升级到新版脚本)迁移一次后，渲染代码自动跟随工具仓库 `main`。修改主题、语言无需重新 `setup`；时区仍需重新生成并替换入口。

## 失败与恢复

| 情况 | 处理方式 |
| --- | --- |
| 找不到 Codex | 在 `.env` 的 `CODEX_BIN` 中指定兼容的 `codex.exe` 绝对路径 |
| 无法读取登录态或统计 | 回原应用检查登录或升级运行时；不手工复制令牌 |
| Token 无效或过期 | 在本机更新 `.env` 后重试 |
| 403、限流或分支规则拒绝 | 检查目标仓库、Contents 读写权限和仓库策略，或等待限流恢复 |
| 仓库为空或不存在 | 先创建 Profile 仓库并提交 README，建立默认分支 |
| 暂时网络错误 | 工具进行有限重试；清洗后的待上传统计保留在本地缓存，下次 `sync` 自动合并 |
| 上传发生 SHA 冲突 | 工具重新读取、合并后重试，不强推 |
| JSON 已上传但图表失败 | 到 Profile Actions 手动运行 Codex Activity，或等待下次每日任务 |
| 统计同步已完成，但显示配置同步失败 | 修复网络或权限问题，再运行 `sync`；已完成的统计上传不会回滚 |
| 显示配置文件无效 | 修正 `data/codex/config.json` 为有效的 `theme`、`language` 对象，或删除该文件后运行 `sync` 重建 |
| 公开 Action 检查失败 | 确认工具仓库公开且 `main` 已发布 `action.yml`，再运行 `setup` |
| 每日任务延迟或停用 | 到 Actions 检查并重新启用，或手动运行 |

Windows 缓存位于 `%LOCALAPPDATA%\codex-activity\<仓库散列>\`，只保存清洗后的统计和同步锁，没有 Token。第一次成功上传前，若缓存和源端历史都丢失，工具无法恢复从未归档的数据。不要把该缓存作为无用文件清理。
