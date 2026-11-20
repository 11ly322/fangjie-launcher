# UBL 0.0.16

发布日期：2026-11-20

0.0.16 是一次品牌清理版本：用户可见名称统一为 unflod bindery launcher（UBL），安装器、快捷方式与日志改用 UBL；不改变存档、实例、数据目录或联机协议。

## 下载

- `UBL-Launcher-0.0.16-Setup.exe` — 179,117,597 B，SHA256 `d88c6da9714b70bca4ba8d0cca51677f8d35107a563c83f7549901d78e9c46da`
- `UBL-Portable-0.0.16.zip` — 179,515,079 B，SHA256 `877cf6eea032b1537a3dcb227dedeb5d6408a3165cdc1f44cfe3124f1fdd2ed6`
- `SHA256SUMS.txt` — 188 B，SHA256 `d4f2622ae6beafb5b428a1404c27960072fee6ca2f707c7961d9ab0fab17c76c`

## 变更

- **窗口与日志**：启动日志前缀与 User-Agent 改为 UBL；窗口标题和设置页继续使用完整名称。
- **安装器**：开始菜单、桌面快捷方式、安装节与完成页统一为 UBL；覆盖安装时删除 0.0.15 及更早的长名称快捷方式，避免重复入口。
- **文档与官网**：README、第三方声明、架构说明、代码签名说明与官网当前版本文案改用 UBL。
- **Rust 元数据**：核心 crate 描述改为 UBL；crate 名、sidecar 文件名和 IPC 接口不变。

## 兼容

- 数据目录仍为 `%APPDATA%\fangjie-launcher`，npm 包名、GitHub 仓库地址、`window.fangjie` 预加载接口、`.fangjie` 实例目录、Microsoft 登录分区和本地存储键均未改名。
- 0.0.15 的数据目录回退逻辑保留；升级不会复制、移动或删除存档与模组。
- 安装目录默认仍为 `%LOCALAPPDATA%\Programs\UBL`。

## 验证

- `npm run typecheck`、`npm test -- --run`（21 个文件 / 74 个测试）、`npm run build`、`npm run package:installer` 通过。
- 隔离的 0.0.15 → 0.0.16 静默覆盖安装退出码为 0；版本显示 0.0.16，安装目录哨兵文件保留，旧快捷方式清理并生成 UBL 快捷方式。
- ASCII 临时目录的静默安装/卸载退出码为 0，安装目录与 HKCU 卸载项均被移除。
- 便携 ZIP 可解压，`UBL.exe` 与 `resources/bin/fangjie-core-sidecar.exe` 存在。

## 边界

- 发布包未做代码签名，Windows SmartScreen 可能提示未知发布者；校验 SHA256 后再运行。
- 测试中把安装目录放在包含中文的深层临时路径时，NSIS 卸载器返回 2、未完成自动卸载；默认安装目录与 ASCII 路径通过。遇到该情况可先手动删除安装目录，再清理 `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\UBLLauncher`。
- 历史发布说明中的“方界”与旧文件名用于描述旧版本，未改写其资产名或校验和。
