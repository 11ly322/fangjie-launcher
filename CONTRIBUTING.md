# 贡献指南

感谢你愿意改进方界启动器。这个项目仍处于 `0.0.1-alpha`，欢迎提交可复现的问题、兼容性反馈和小而清晰的改动。

## 开发环境

- Windows 10/11 x64
- Node.js 20.19 或更高版本
- npm（使用仓库中的 `package-lock.json`）

```powershell
npm ci
npm run dev
```

## 提交前检查

请在本地运行：

```powershell
npm run typecheck
npm test
npm run build
```

涉及安装、启动或界面布局的改动，请描述你实际验证过的版本、加载器和截图。不要把个人账号、访问令牌、真实存档或 `test-artifacts/` 提交到仓库。

## 提交问题

- Bug 请附带启动器版本、Windows 版本、Java 版本、Minecraft 版本、加载器及复现步骤。
- 日志请先移除用户名、服务器地址、令牌等敏感信息。
- 安全漏洞不要公开发 issue，请按 [SECURITY.md](SECURITY.md) 的方式私下报告。

## 提交改动

- 保持改动聚焦，一个 PR 尽量只解决一个问题。
- 遵循现有代码风格：TypeScript strict、React 函数组件、CSS 使用 `src/renderer/src/styles.css` 中的设计变量。
- 新行为需要说明验证方式；纯 UI 改动请附截图。
- 不要提交 `release/`、`out/`、`node_modules/` 或测试数据。

## 许可证

提交代码即表示你同意以 [MIT License](LICENSE) 授权你的贡献。
