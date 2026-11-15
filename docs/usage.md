# 使用指南

**简体中文（默认）** | [English](./usage.en.md) | [返回首页](../README.md)

首次接入见[快速开始](../README.md#快速开始)。凭据和公开数据边界见[隐私与凭据](./security.md)。

## 配置

| 配置 | 必填 | 说明 |
| --- | --- | --- |
| `GITHUB_TOKEN` | 是 | 仅选择目标仓库、具有 Contents 读写权限的细粒度 Token |
| `GITHUB_REPOSITORY` | 是 | 已存在的 `owner/repo`，使用默认分支；不能填写 URL |
| `CODEX_BIN` | 否 | `codex.exe` 的绝对路径；留空自动发现 |
| `TIMEZONE` | 否 | IANA 显示时区，如 `Asia/Singapore`；留空读取本机时区 |

默认只读取当前工作目录的 `.env`，不搜索父目录，不静默使用进程环境中的其他 Token。可显式指定配置文件：

```powershell
npm run sync -- --env-file C:\private\codex-activity.env
```

## 命令与接入材料

| 命令 | 行为 |
| --- | --- |
| `npm run setup` | 检查 Codex 统计和仓库访问，验证公开工具版本，在 `generated/` 生成材料；不修改远程仓库或 `.env` |
| `npm run status` | 检查采集与 GitHub 读取权限，显示最近上传时间；不写远程内容 |
| `npm run sync` | 读取统计、合并已观测历史并比较内容，有变化才上传 |
| `node src/cli.mjs --help` | 显示命令帮助，无需配置或网络访问 |

`setup` 生成的文件：

| 文件 | 用途 |
| --- | --- |
| `codex-activity.yml` | 复制到 Profile 仓库 `.github/workflows/` 的工作流入口 |
| `README-snippet.md` / `README-snippet.en.md` | 中文默认 / 英文 Profile README 片段，选择一个使用 |
| `SETUP.md` / `SETUP.en.md` | 中文默认 / 英文接入说明，保留在本机参考 |

已有旧版材料时，运行新版 `setup` 可补齐双语说明。`setup` 和 `status` 不验证实际写入，首次 `sync` 才能最终验证写入权限。成功上传和无变化均返回退出码 0，失败返回 1。上传成功表示 JSON 已提交，SVG 仍需等待 Actions 完成。

目前只支持单机、单账户手动同步，不提供本地定时任务或多设备、多账户合并。更换账户时应建立独立历史。

## 数据与历史

Profile 中由工具维护 `data/codex/usage.json`，Actions 只写 `assets/codex-activity.svg`。不要手工编辑统计 JSON。

- 保存接口实际返回的所有历史，不假定固定返回多少天。
- 同日使用新值覆盖，不累加；接口窗口缩短不删除已保存日期。
- 明确返回的 0 表示零用量，缺失日期表示 `unknown`；每日桶为 `null` 或采集失败时不覆盖远程文件。
- 汇总值允许 `null`，图表显示 `Unavailable`。累计 Token 使用官方汇总，不通过有限每日记录求和推算。
- 仅公开协议版本、来源标记、累计 Token、连续天数和每日 Token，不公开账户信息或原始 RPC。

## 时间、主题与每日滚动

`Last updated` 来自最近修改统计 JSON 的 Git 提交时间，表示最近实际上传时间。无变化时不上传，也不改变该时间；手工编辑 JSON 则会把那次提交变成新的更新时间。

工作流每天按显示时区约 **00:17** 重绘最近 52 周并更新当天标记，本机可以关机。模板使用 IANA timezone 定时设置；新加坡 00:17 等价于 UTC 前一天 16:17。GitHub 调度可能延迟，公开仓库长期无活动时定时任务可能停用。

每日重绘不查询 Codex，也不改变 `Last updated`。未上传的新日期保持 `unknown`，摘要仍是上次同步时的值。官方日期桶原样保留，显示时区不会重新拆分每日统计。

主题默认 `github-dark`。浅色主题需将 Profile 工作流入口中的 `theme` 改为 `github-light`；修改入口会触发重绘。工作流和渲染器固定为完整提交 SHA，升级时重新运行新版 `setup` 并替换 Profile 工作流入口。

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
| 公开版本验证失败或 checkout 找不到 SHA | 确认正确提交已推送到公开工具仓库，再运行 `setup` 更新入口 |
| 每日任务延迟或停用 | 到 Actions 检查并重新启用，或手动运行 |

Windows 缓存位于 `%LOCALAPPDATA%\codex-activity\<仓库散列>\`，只保存清洗后的统计和同步锁，没有 Token。第一次成功上传前，若缓存和源端历史都丢失，工具无法恢复从未归档的数据。不要把该缓存作为无用文件清理。
