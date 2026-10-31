# UBL 0.0.7

`unflod bindery launcher`（UBL）0.0.7 增加实例加载器的二次修改，并修复白天模式悬浮提示仍为深色的问题。

## 发布包

| 文件 | 大小 | SHA256 |
| --- | --- | --- |
| `UBL-Launcher-0.0.7-Setup.exe` | 170.7 MiB（179,001,646 B） | `25594d27f44aca9d559b474b67ede7e31644c3e16df38799f66ba5e0655c6684` |
| `UBL-Portable-0.0.7.zip` | 171.1 MiB（179,404,065 B） | `0c532b8a14216c6410956a462332e25b889ea8e21597190614bfd64f826386fc` |

`SHA256SUMS.txt` 包含上述两个文件。

## 重点变化

- 实例设置新增“模组加载器”面板，支持在原版、Fabric、Quilt、Forge、NeoForge 之间切换，也可以直接移除加载器。
- 切换加载器只更新实例的 `loader`、`loaderVersion`、`versionId`；不会删除存档、配置、模组或共享版本目录中的旧加载器文件。
- 切换前按当前 Minecraft 版本核验可用加载器；游戏运行期间禁止切换；离线模式允许移除加载器，但禁止下载新加载器。
- 游戏参数、启动前命令、Java 选择、内存预设、版本隔离等高级设置继续保留。
- 修复白天模式下 toast 仍使用深色背景与文字的问题。

## 发布与用户数据

- 安装包按当前用户安装到 `%LOCALAPPDATA%\Programs\UBL`，不请求管理员权限。
- 升级只替换启动器程序文件，继续使用 `%APPDATA%\fangjie-launcher` 数据目录；不会创建或改写玩家已有的实例、存档、模组、配置和皮肤。
- 0.0.6 及更新版本可以通过更新器下载并安装 0.0.7，完成后自动重启；0.0.5 及更早版本仍建议手动安装一次新版。
- 发布包未做代码签名，Windows SmartScreen 可能提示未知发布者，请先校验 SHA256。

## 验证

- `npm run typecheck`、`npm test`（19 个文件 / 61 个测试）、`npm run build`、`npm run package:installer` 通过。
- `instanceLoader` 单元测试 5 个：安装/切换、移除、同加载器 no-op、游戏运行中阻止、离线保护。
- 实例 E2E：Fabric 实例切回原版后 `loader: 'vanilla'`、`versionId: '1.20.1'`，加载器面板正常显示，实例文件未被删除。
- 便携版 smoke：标题 `unflod bindery launcher`、`window.fangjie` 与 `.app-shell` 正常、版本显示 `v0.0.7`。
- NSIS 静默安装/卸载：FileVersion/ProductVersion `0.0.7`，`UBL.exe` 与 Rust sidecar 存在，卸载后目录清理。

## 已知边界

- 没有可信代码签名证书，安装包未签名。
- 切换加载器不会自动迁移或转换模组，跨加载器兼容性由玩家确认。
- 加载器切换会保留旧加载器文件，便于其它实例复用，但不会清理不再使用的版本。
- 真实跨机器 NAT/P2P RTT 仍需按测试矩阵验证。
