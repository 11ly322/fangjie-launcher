# 更新记录

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)，当前处于 `0.0.x` 预览阶段。

## 0.0.1-alpha — 2026-10-29

首个开源预览版。

### 新增

- Minecraft 游戏实例，独立存档、模组、配置与日志目录。
- 原版 / Fabric / Quilt / Forge / NeoForge 五种加载器安装。
- Modrinth / CurseForge 双模组源搜索、依赖补齐与安装。
- Microsoft 正版账号 OAuth 登录，令牌使用 Electron `safeStorage` 加密。
- 64×64 本地离线皮肤：自动安装 CustomSkinLoader 并写入 LocalSkin 配置。
- 下载中心、任务进度、启动日志、模组启停与移除、Java 自动下载与手动路径。
- 无边框窗口、深色界面与自定义应用图标。

### 验证

- Fabric 1.21.4 + Sodium 安装并启动到客户端初始化。
- Quilt 0.30.1、Forge 54.1.22、NeoForge 21.4.161 安装并启动到纹理图集阶段。
- CurseForge Mouse Tweaks + Fabric API 安装成功。
- 本地皮肤配置写入成功；Microsoft 登录窗口与取消流程通过测试。

### 已知限制

- 仅支持 Windows x64。
- Microsoft 正版登录尚未使用真实账号完成端到端在线启动验证。
- 本地皮肤仅自己可见，仅支持经典模型。
- 暂不支持整合包、资源包、光影、OptiFine 与自动更新。
