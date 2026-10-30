# 更新记录

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)，当前处于 `0.0.x` 预览阶段。

## 0.0.2-beta — 2026-10-30

### 新增

- **模组工坊**：安装前选择版本；展开必需前置索引并可直接跳转；打开 Modrinth/CurseForge 介绍页面。
- **CurseForge 模组源**：搜索、项目详情、依赖补齐与文件安装；资源包/光影同样支持双源。
- **安装版本切换**：已安装模组可切换版本，替换旧 JAR 并更新安装记录。

### 验证与边界

- 模组版本切换已用 CurseForge Mouse Tweaks 实测：2.25 → 2.26，旧 JAR 被替换，Fabric API 依赖保留。
- 安装包仍未使用受信任证书签名；真实签名自动更新和跨机器 NAT/P2P 延迟仍需实测。

## 0.0.2-alpha — 2026-10-30

### 新增

- **整合包**：`.mrpack` 与 CurseForge `.zip` 导入现有实例；模组列表导出。
- **资源包/光影**：Modrinth + CurseForge 搜索与安装。
- **OptiFine**：官方 installer 引导安装，临时 APPDATA junction，profile 自动绑定。
- **网络**：HTTP(S) 代理、Modrinth/CurseForge API 基址、统一 native fetch seam。
- **房间快捷入口**：首页创建/粘贴/加入房间码；联机状态与网络摘要。
- **插件/离线**：本地 manifest 版本/权限校验；全局离线开关与 fetch guard。
- 三套可持久化主题：苔原、深海、余烬；切换立即应用，并在下次启动保持。
- 设置页支持更改游戏数据目录：选择空文件夹后完整复制当前数据，保留旧目录，重启后生效。
- P0 故障诊断 UI：Rust sidecar 接入崩溃模式、JAR 扫描、diff 预览、备份/回滚。
- P0 模组勾选批量启停、实例深复制与模板、Flight Recorder 折线图与 CSV 导出。
- 实例设置新增 JVM 参数、窗口宽高字段。
- P1 基础更新器：GitHub Releases 检查、下载、SHA256 校验与 NSIS `/S` 安装入口。

## 0.0.1-beta — 2026-10-30

### 新增

- **房间联机（实验）**：房主创建 `U/XXXX-XXXX-XXXX-XXXX` 房间码，房客凭码加入。
- Rust 原生连接器内嵌 EasyTier 库，强制 no-tun + smoltcp，不创建 TUN 网卡、不请求管理员权限。
- 复用 EasyTier 社区公共中继节点；启动器不运营中转、信令或 TURN 服务。
- E2E 验证：Host 生成房间码，Guest 加入后取得 `127.0.0.1:<port>` 地址，SCF 玩家列表显示双方；公共中继下完成 TCP 双向回显。
- 连接器补丁移除 faketcp/wireguard/proxy-packet/vpn-portal/tun feature，避免 `packet.dll` 与 Npcap 依赖。

### 说明

- 连接器是独立 GPL-3.0-or-later 组件，启动器主体仍为 MIT；详见 `resources/bin/LICENSE-qomicex.txt`。
- P2P 真实跨机器数据面尚需在真实网络环境验证。

## 0.0.1-alpha — 2026-10-29

首个开源预览版。

### 新增

- Minecraft 游戏实例，独立存档、模组、配置与日志目录。
- 原版 / Fabric / Quilt / Forge / NeoForge 五种加载器安装。
- Modrinth / CurseForge 双模组源搜索、依赖补齐与安装。
- Microsoft 正版账号 OAuth 登录，令牌使用 Electron `safeStorage` 加密。
- 64×64 本地离线皮肤：自动安装 CustomSkinLoader 并写入 LocalSkin 配置。
- 下载中心、任务进度、启动日志、模组启停与移除、Java 自动下载与手动路径。
- Windows NSIS 安装包：按用户安装、桌面/开始菜单快捷方式、卸载入口。
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
