# 方界 0.0.2-alpha

这是 `0.0.2-alpha` 预发布版，重点是 P1/P2/P3 最小可用闭环。

## 新增

- 自动更新器：GitHub Releases 检查、下载、Rust SHA256 校验、NSIS `/S` 入口。
- 整合包：`.mrpack` 与 CurseForge `.zip` 导入现有实例；模组列表导出。
- 资源包/光影：Modrinth + CurseForge 搜索与安装。
- OptiFine：选择官方 installer，无窗口调用本地安装接口并绑定 profile。
- 网络：HTTP(S) 代理、Modrinth/CurseForge API 基址；所有主进程 native fetch 走统一 seam。
- 房间码首页快捷入口、直连/中继地址解析、地址 TCP/中继 TCP 延迟、网络摘要。
- 插件清单：版本/API/权限校验；全局离线模式。

## 已知边界

- 安装包未做受信任代码签名；Windows SmartScreen 可能提示未知发布者。
- 真实签名 NSIS 自动替换未验证。
- 跨机器 NAT 与 EasyTier P2P RTT 仍需实测；当前延迟为地址/中继 TCP。
- OptiFine 安装依赖本机 Java 和用户提供的官方 installer。
- 连接器为独立 GPL-3.0-or-later 组件；启动器主体 MIT。

## 校验

下载后请用 `SHA256SUMS.txt` 校验。
