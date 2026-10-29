# 安全政策

## 支持范围

当前维护 `0.0.1-alpha` 及后续预览版本。旧版本可能不会获得安全修复。

## 报告漏洞

请通过 GitHub 的私密安全公告报告：

https://github.com/11ly322/fangjie-launcher/security/advisories/new

不要在公开 issue 中披露可被利用的细节、访问令牌、Microsoft 登录数据或包含个人路径的完整日志。

报告中请尽量包含：

- 受影响的版本与操作系统
- 复现步骤和影响范围
- 相关日志片段（先移除令牌、用户名、服务器地址等敏感信息）
- 你建议的修复方向（可选）

## 敏感数据说明

启动器会将 Microsoft 登录令牌使用 Electron `safeStorage` 加密后保存在本机配置中，不会发送到项目维护者或第三方服务。请不要在 issue、PR 或截图中暴露 `config.json`、`launcher-main.log` 或完整的游戏日志。
