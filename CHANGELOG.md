# 更新记录

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)，当前处于 `0.0.x` 预览阶段。

## 未发布

### 新增

- 三套可持久化主题：苔原、深海、余烬；切换立即应用，并在下次启动保持。
- 设置页支持更改游戏数据目录：选择空文件夹后完整复制当前数据，保留旧目录，重启后生效。

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
