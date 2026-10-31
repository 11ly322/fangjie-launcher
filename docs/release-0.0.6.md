# UBL 0.0.6

`unflod bindery launcher`（UBL）0.0.6 是 0.0.5 之后的修复与功能版本。它修复了“下载更新后安装并重启不可用”和白天模式弹窗发黑，并把书架实例切换、整合包下载、版本隔离和高级启动设置带入正式版。

## 下载

| 文件 | 大小 | SHA256 |
| --- | --- | --- |
| `UBL-Launcher-0.0.6-Setup.exe` | 170.7 MiB（178,997,177 B） | `308210ab7029990b6650a5a4f7981363793cb6d99023ba1ec9ce3b75f200f869` |
| `UBL-Portable-0.0.6.zip` | 171.1 MiB（179,401,470 B） | `c8d3f4a63c31d414f42541033cbde23d0f60d711871c2c3fa5cf55e49157eb44` |

`SHA256SUMS.txt` 同时包含以上两个文件的校验和。

> 0.0.5 内置的是旧更新流程，无法自动升级到 0.0.6。请手动下载安装一次 0.0.6；从 0.0.6 起更新完成后会自动重启。

## 新增

- **书架实例切换**：首页书架最多展示 7 个实例，点击书脊切换当前实例，当前书脊高亮。
- **整合包下载**：模组工坊新增“整合包”页签，支持 Modrinth / CurseForge 搜索、详情和下载 `.mrpack` / 整合包文件到 `<数据目录>/downloads/modpacks/`。
- **版本隔离**：创建实例和实例设置均可选择是否版本隔离；关闭后共享 `saves`、`mods`、`config` 与游戏目录，界面会提示风险。
- **高级启动设置**：支持游戏参数、启动前命令、指定 Java、内存预设（均衡/G1GC/低延迟/ZGC）、禁用 Java Launch Wrapper、禁用 LWJGL Unsafe Agent、高性能显卡。

## 修复

- **更新安装并重启**：更新器改为独立 helper，等待启动器退出后执行 `/S /D=<当前安装目录>` 静默安装，然后保留 `--user-data-dir` 重新启动应用；设置页显示“正在安装并重启…”。
- **白天模式弹窗**：修复弹窗遮罩、底栏和部分卡片仍为黑色的问题，统一为浅色表面。

## 验证

- `npm run typecheck` 通过。
- `npm test`：18 个文件 / 56 个测试通过。
- `npm run build`、`npm run package:installer` 通过。
- 便携版 smoke：标题 `unflod bindery launcher`，bridge 与 `.app-shell` 正常，版本显示 `v0.0.6`。
- NSIS 静默安装/卸载：安装目录、`UBL.exe`、Rust sidecar、FileVersion/ProductVersion `0.0.6` 与卸载清理通过。
- 更新器 E2E：从 0.0.6 检测并安装本地 0.0.7 测试包，旧 PID `4864` → 新 PID `1520`，安装目录和自定义 `--user-data-dir` 保留，窗口重新出现。
- 功能 E2E：书架点击切换实例；整合包下载 `Fabulously.Optimized-5.4.1.mrpack`（58,960 B）；白天模式弹窗底栏 `rgb(247,247,250)`；高级设置持久化。

## 边界

- 发布包仍未做代码签名，Windows SmartScreen 可能提示未知发布者。
- 整合包当前是下载文件，导入实例仍使用现有导入入口。
- 版本隔离关闭时，删除实例不会删除共享世界。
- 真实签名更新、跨机器 NAT / P2P RTT 仍需按文档实测。
