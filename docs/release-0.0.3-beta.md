# 方界 0.0.3-beta

这是 `0.0.3-beta` 补丁预发布版，重点是修复系统根证书环境下的更新检查失败。

## 修复

- **更新检查 TLS 回退**：Node 内置 CA 不包含公司/用户根证书时，自动改用 Electron Chromium 网络栈重试，不再只报 `fetch failed`。
- **下载复用同一网络层**：GitHub Releases 资产下载也走同一回退，下载完成后仍由 Rust 校验大小与 SHA256。
- **更明确的错误提示**：证书、代理/防火墙、更新源 HTTP 错误分别提示，便于用户定位。

## 验证

- 模拟 `0.0.2-alpha`：更新检查返回可用版本 `v0.0.3-beta`，无页面渲染错误。
- 通过更新器下载 202 字节的 `SHA256SUMS.txt`，内容与 SHA256 校验通过。
- 打包后的 `0.0.3-beta` 便携版启动正常，`updateCheck()` 返回成功且无网络错误。
- NSIS 静默安装/卸载通过，产品版本、显示版本均为 `0.0.3-beta`。

## 升级提示

`0.0.2-alpha` 和 `0.0.2-beta` 自带的更新器不包含本次 TLS 回退，无法自行完成这次修复。请先手动下载安装本版一次；从 `0.0.3-beta` 起，后续更新检查可在该系统证书环境中正常工作。

## 已知边界

- 安装包仍未使用受信任证书签名；Windows SmartScreen 可能提示未知发布者。
- 真实签名 NSIS 自动替换仍需实测；跨机器 NAT 与 EasyTier P2P RTT 仍是边界。
- OptiFine 安装依赖本机 Java 和用户提供的官方 installer。
- 连接器为独立 GPL-3.0-or-later 组件；启动器主体 MIT。

## 校验

```text
d316509254334deeb48619aee9deed11050e79a8a0e5904a409b6b38570ae491  Fangjie-Portable-0.0.3-beta.zip
eda483ecd4a02ed38c30cd5df60b442edafd73ba16b2320b9efa1100589293fa  Fangjie-Launcher-0.0.3-beta-Setup.exe
```

下载后请用 `SHA256SUMS.txt` 再次校验。
