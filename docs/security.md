# 隐私与凭据

**简体中文（默认）** | [English](./security.en.md) | [返回首页](../README.md)

## 本机凭据

`.env` 是本机明文配置，只应保存在自己的电脑上。它被 Git 忽略，不进入 npm 发布包或生成的接入材料。工具不创建包含真实 Token 的 `.env`，也不把 Token 复制到缓存、进程全局环境或 Codex 子进程。

只为目标 Profile 仓库创建具有 **Contents: Read and write** 的细粒度 Token，并设置有效期。该权限覆盖所选仓库，并非只能修改统计文件；不需要 Workflows 权限。

不要把 `.env` 加入 Profile 仓库，不要用 `git add -f` 绕过忽略规则，也不要把 Token 发进聊天或 issue。过期或更换凭据时，只更新本机配置。

## 采集与上传边界

GitHub 上传通过原生 `fetch` 访问官方 API，拒绝 HTTP 重定向。Codex 采集使用运行时自己的登录状态；工具不读取、复制或上传 `auth.json`，不创建对话或运行模型。检查公开 Action 时，不发送 Profile Token。

公开数据根据字段白名单重新构造，仅保留协议版本、来源标记、累计 Token、连续天数和每日 Token。独立的 `data/codex/config.json` 仅公开主题 `theme` 和语言 `language`，不上传整个 `.env`。原始账户、邮箱、Cookie、API key 和令牌字段不会被复制。日志不输出原始响应、请求头、配置对象或上游异常。

统计提交使用目标仓库拥有者的 GitHub noreply 邮箱署名，避免把私人主邮箱放入公开提交元数据。署名不替代 Token 鉴权。

## Actions 与本地缓存

Actions 只使用 GitHub 自动提供的临时 `GITHUB_TOKEN`，不需要本机 Token、Codex 登录态或额外仓库 Secrets。它只负责重绘和提交 SVG。

本地缓存仅包含清洗后的统计与进程锁，不包含 Token；缓存位置和恢复语义见[使用指南](./usage.md#失败与恢复)。`generated/` 中的接入材料不包含 Token，但会包含目标仓库和显示时区，因此保留为本机文件并由 Git 忽略。
