# Codex Activity 实现约定

本项目采用 Node.js 24.10+、ES Modules 和零运行时依赖，支持 Windows 上的单机 Codex 活动同步。

## 配置与授权

用户复制 .env.example 为 .env，填写目标 Profile 仓库和仅有该仓库 Contents 读写权限的细粒度 Token。CLI 使用 Node 内置 parseEnv 解析文件，原生 fetch 请求 GitHub；不依赖 gh，不把配置整体注入环境。Codex 继续使用已安装运行时自己的登录态。

.env 不提交、不打包、不复制到缓存；原始授权、RPC、异常和 HTTP 请求头不输出到日志。公开 JSON 通过白名单构造。远程 Actions 只使用自动签发的 GITHUB_TOKEN，不接收本机凭据。

## 数据与显示

Profile 仅保存 usage.json、SVG、README 和最小工作流入口。usage.json 同时保存已观测的每日历史和最新官方汇总；同日覆盖、缺失保留，零与未知分开。无变化不上传，首次成功采集自动建档。

Last updated 取最近一次修改 usage.json 的 Git 提交时间。每日定时任务按今天滚动图表，但不改变同步时间。未观测日期显示为未知，不能标为零。

## 交付

提供 setup、status、sync；独立仓库提供可复用工作流。固定工作流及渲染代码 SHA，按需写回 SVG。只维护秘密保护、历史去重、上传恢复和图表时间四组关键检查，不引入大量测试或服务框架。完整操作说明以 README.md 为准。
