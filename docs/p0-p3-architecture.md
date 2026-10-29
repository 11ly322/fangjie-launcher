# P0–P3 架构、接口与交付边界

更新时间：2026-10-30  
状态口径：**P0 已实现并通过本地 E2E；P1/P2/P3 是接口与实施设计，未宣称已交付。**

---

## 1. 总体结构

当前发布版仍是 Electron 启动器。Rust 核心通过一个长期运行的 JSON-lines sidecar 接入 Electron，而不是假装当前仓库已经是 Tauri 应用。

```text
┌──────────────────────────── Electron renderer (React) ───────────────────────────┐
│ 实例详情 / 模组 / 设置 / 房间联机                                                 │
│ window.fangjie.<method>()                                                         │
└───────────────────────────────────┬───────────────────────────────────────────────┘
                                    │ preload contextBridge
┌───────────────────────────────────▼───────────────────────────────────────────────┐
│ Electron main                                                                     │
│  ├─ store.ts / tasks.ts / minecraft.ts / mods.ts / multiplayer.ts                 │
│  ├─ rustCore.ts  ── JSON lines ──► resources/bin/fangjie-core-sidecar.exe         │
│  └─ ipc.ts：参数校验、错误映射、store 同步、广播 data:changed                      │
└───────────────────────────────────┬───────────────────────────────────────────────┘
                                    │ stdin/stdout JSON
┌───────────────────────────────────▼───────────────────────────────────────────────┐
│ Rust fangjie-core                                                                │
│  crash_diagnosis  mod_scanner  repair_engine  download_source                   │
│  instance_manager  flight_recorder  plugin_api  update_manager*  modpack_importer*│
│  (* = P1 接口已落文件，未接入运行路径)                                            │
└───────────────────────────────────────────────────────────────────────────────────┘
```

设计取舍：

- **sidecar 而非 N-API**：不需要为 Electron ABI 重新编译原生模块；Rust 进程退出不会拖垮 UI。
- **长驻进程**：修复计划在 preview 时保存在内存，apply/rollback 不需要把计划状态散落到 renderer。
- **明确错误边界**：Rust 返回结构化 JSON；Electron `handle()` 统一映射为 `Result<T>`。
- **不留第二套网络实现**：P0 的崩溃修复通过 `SourceRegistry` 下载；后续 P1 镜像/代理也扩展同一抽象。

---

## 2. P0：已就绪能力接入 UI

### 2.1 P0 文件

```text
rust/fangjie-core/src/bin/fangjie-core-sidecar.rs   JSON-lines 适配器
rust/fangjie-core/src/crash_diagnosis.rs            10 类模式、证据、动作
rust/fangjie-core/src/mod_scanner.rs                JAR 元数据、缺失前置、重复、冲突
rust/fangjie-core/src/repair_engine.rs              diff、备份、apply、rollback
rust/fangjie-core/src/instance_manager.rs           复制、模板、批量启停
rust/fangjie-core/src/flight_recorder.rs            CSV 写入、读取、图表序列
src/main/rustCore.ts                                sidecar 生命周期与请求队列
src/main/ipc.ts                                     崩溃/批量/复制/模板/性能 IPC
src/renderer/src/components/CrashDiagnosticsModal.tsx
src/renderer/src/components/FlightRecorderModal.tsx
src/renderer/src/pages/InstanceDetailPage.tsx
```

### 2.2 Electron IPC 契约

全部方法都经 `preload` 暴露为 `Promise<Result<T>>`，失败不抛到 renderer。

| IPC | 签名 | 行为 |
| --- | --- | --- |
| `core:status` | `() => CoreStatus` | sidecar 是否存在；不启动进程 |
| `crash:diagnose` | `(instanceId) => CoreDiagnosisBundle` | 读取 latest.log、crash-report、扫描 JAR |
| `crash:preview` | `(instanceId) => CoreRepairPlan` | **只读**；生成 diff，不落盘 |
| `crash:apply` | `(planId) => CoreRepairReceipt` | 必须由 UI 确认后调用；逐文件备份 |
| `crash:rollback` | `(repairId) => CoreRepairReceipt` | 逆序恢复备份 |
| `mods:set-enabled-batch` | `(instanceId, fileNames[], enabled) => InstalledMod[]` | 先校验全部目标，再统一 rename |
| `instances:copy` | `(instanceId, name) => Instance` | Rust 深拷贝数据，Electron 注册新元数据 |
| `instances:save-template` | `(instanceId) => CoreInstanceTemplate` | 保存 JVM 参数、模组文件、内存、分辨率 |
| `flight:series` | `(instanceId) => CoreFlightSeries` | 读取 logs/flight-recorder.csv 并生成 series |
| `flight:export` | `(instanceId) => string \| null` | 保存对话框导出 CSV |

### 2.3 sidecar 协议

请求：一行一个 JSON，`op` 为 tag；响应：一行一个 JSON。

```json
{"id":"uuid","op":"diagnose","instance":{...}}
{"id":"uuid","op":"preview_repair","instance":{...},"options":{"disable_conflicts":true,"source_id":"modrinth"}}
{"id":"uuid","op":"apply_repair","plan_id":"...","confirmed":true}
{"id":"uuid","op":"rollback_repair","repair_id":"..."}
{"id":"uuid","op":"set_mods_enabled","instance":{...},"changes":[{"file_name":"a.jar","enabled":false}]}
{"id":"uuid","op":"copy_instance","source":{...},"instances_root":"...","new_id":"...","new_name":"..."}
{"id":"uuid","op":"save_template","instance":{...},"templates_root":"...","template_id":"..."}
{"id":"uuid","op":"flight_series","csv_path":"...\\logs\\flight-recorder.csv"}
```

`confirmed` 由主进程固定传 `true`，但 renderer 只有在 diff 预览页面点击“确认执行修复”才会触发 apply。

### 2.4 崩溃诊断体验

- 入口：实例详情页顶部「崩溃诊断」。
- 首屏：日志行数、命中模式数、JAR 数、是否找到 crash-report。
- 每条诊断：severity、置信度、根因、证据摘录、建议动作（自动/手动）。
- 生成预览：展示 `新增/修改/重命名/删除`、before/after、动作数、警告。
- 执行：写入 `.fangjie/backups/<repair_id>/receipt.json`。
- 回滚：receipt 页面直接回滚；成功后重新诊断。
- **副作用边界**：P0 只自动执行模组冲突禁用、缺失前置下载、配置重置等 Rust 已有动作；不在 UI 中伪造 Java/内存修复。

### 2.5 批量模组与实例复制

- 实例详情 → 模组 tab：全选、启用所选、禁用所选；每个实例使用自己的 `.minecraft/mods`。
- 复制：Rust 深拷贝目录，跳过 `.fangjie`；新 id、新元数据；源实例只读。
- 模板：JVM 参数、模组文件列表、内存、宽高；写入 `<data>/templates/<id>.json`。
- 实例设置新增 JVM 参数、窗口宽高字段；模板会读取真实值，而不是占位值。

### 2.6 Flight Recorder

- Rust `read_csv` 校验四列，`chart_series_from_samples` 生成 `[seconds,value]`。
- UI 显示平均 FPS、最低 1% lows、平均帧时间、采样点，以及 FPS/1% lows 和帧时间两张 SVG 折线图。
- `flight:export` 通过系统保存对话框导出 CSV。
- 当前没有内置 in-game 采样器；CSV 由 Rust sampler/外部工具写入 `logs/flight-recorder.csv` 后由 UI 读取。

### 2.7 P0 验证记录

- `cargo test`：12 passed（原有 12 个测试）
- `npm test`：6 passed
- `npm run typecheck`：通过
- `npm run build`：通过
- `npm run package`：通过；`release/Fangjie-win32-x64/resources/bin/fangjie-core-sidecar.exe` 已包含，打包版 `coreStatus` 与崩溃诊断已验证。
- Electron E2E：
  - 崩溃诊断命中 OptiFine/Sodium 冲突 → diff 1 行 → apply 后 `optifine.jar.disabled` → rollback 后 `optifine.jar` 恢复。
  - 批量禁用/启用 sodium，实例文件状态正确。
  - 复制实例后，在副本禁用 sodium：副本 `.jar.disabled` 为 true，源实例 `sodium.jar` 仍为 true。
  - 模板 JSON 包含 `jvm_args:["-XX:+UseG1GC","-Xms1G"]`、`width:1920`、`height:1080`。
  - Flight Recorder 两张图、CSV 导出文件 255 bytes。
  - 无 renderer 控制台错误。
- P1 基础：fake feed 检测 0.0.2、下载 22-byte 资产、Rust SHA256 校验通过；模组列表导出实测；资源包安装实测。
- 模板中的 JVM 参数、宽高已接入 Electron 实例设置，并传入启动器 `launch()` 的 resolution/extraJVMArgs。

---

## 3. P1：竞品基准线

### 3.1 自动更新器（P1 基础实现已接入）

已落 Rust 接口文件：`update_manager.rs`，并通过 sidecar 接入 Electron。

```rust
pub enum UpdateChannel { Stable, Beta }

pub struct UpdateAsset {
    pub platform: String,
    pub url: String,
    pub sha256: String,
    pub size: u64,
    pub signature: Option<String>, // 预留签名，不把 SHA256 当签名
}

pub struct UpdateManifest {
    pub version: String,
    pub channel: UpdateChannel,
    pub notes: String,
    pub published_at: String,
    pub assets: Vec<UpdateAsset>,
}

pub fn check_manifest(current_version: &str, manifest: UpdateManifest)
    -> CoreResult<UpdateCheck>;
pub fn verify_asset(path: &Path, asset: &UpdateAsset) -> CoreResult<()>;
```

已实现（P1 基础）：

- `src/main/updateManager.ts`：GitHub Releases/自定义 feed 检查、下载、SHA256 校验、调用 NSIS `/S`。
- 设置页「软件更新」：检查、下载、安装并重启。
- 已验证：本地 fake feed 检查到 `0.0.2`，下载 22-byte payload，Rust `verify_asset` 校验通过；真实签名安装包替换未实测。

Electron 流程：

```text
update:check
  → 读取 GitHub Releases latest.json（通过可配置 UpdateFeed 抽象）
  → Rust check_manifest 比较 semver
  → update:download 到 %LOCALAPPDATA%\Fangjie\updates\<version>\
  → Rust verify_asset（大小 + SHA256；后续加签名）
  → update:apply
      → 启动 NSIS /S 安装器（当前用户，无管理员）
      → 退出当前进程；安装器替换安装目录
      → 下一次启动读取新版本
```

实现顺序：更新 feed 抽象 → 下载/校验 → UI 提示 → NSIS 替换 → 签名/回滚。当前已完成前四项的基础路径；签名和真实安装包替换待 P3/发布验证。

### 3.2 整合包导入/导出（部分实现）

已实现：将 `.mrpack` 应用到现有实例（files + overrides）；已用本地 HTTP 资产测试成功。CurseForge `.zip` 导入基础路径已接入：读取 `manifest.json`、通过 CurseForge API 解析 fileID、下载到 mods、复制 overrides；已用无文件 zip 验证 overrides。真实 CurseForge 文件下载仍建议用公开小包复测。


已落接口：`modpack_importer.rs`。

```rust
pub enum ModpackFormat { ModrinthMrpack, CurseForgeZip }
pub struct ModpackManifest { name, version, minecraft_version, loader, loader_version, files }
pub trait ModpackImporter {
    fn format(&self) -> ModpackFormat;
    fn detect(&self, archive: &Path) -> bool;
    fn read_manifest(&self, archive: &Path) -> CoreResult<ModpackManifest>;
    fn plan(&self, archive: &Path, instance_root: &Path) -> CoreResult<ModpackImportPlan>;
}
```

- `.mrpack`：读取 zip 内 `modrinth.index.json`；逐项校验 path 不逃逸实例根；当前基础实现由 Rust importer 直接 ureq 下载，P1.9 需要迁到 `DownloadSource`。
- CurseForge `.zip`：读取 `manifest.json`，`projectID/fileID` 转 CurseForge 下载源；overrides 复制到实例。
- “仅导出模组列表”：复用 `ModListExport`，输出 JSON，不打包 JAR。
- 顺序：格式检测 → manifest 解析 → 实例创建/选择 → 下载 → 冲突预览 → 应用。

### 3.3 资源包/光影下载（P1 基础实现已接入）

已实现 Modrinth + CurseForge 的资源包/光影搜索与安装：ModsPage 顶部类型切换；`installAsset()` 写入 `resourcepacks/` 或 `shaderpacks/`；已用 Fast Better Grass 实测 Modrinth 安装，CurseForge 搜索返回 1 万条结果。网络仍走现有 TS 下载器，P1.9 统一源尚未完成。

接口扩展：

```rust
pub enum ProjectKind { Mod, ResourcePack, Shader }

pub struct SearchOptions {
    pub kind: ProjectKind,
    pub query: String,
    pub game_version: String,
    pub loader: Loader,
    pub limit: u32,
}

pub trait DownloadSource {
    fn search(&self, options: &SearchOptions) -> CoreResult<Vec<ModCandidate>>;
    fn resolve(&self, project_id: &str, kind: ProjectKind) -> CoreResult<ResolvedProject>;
    fn download(&self, resolved: &ResolvedProject, destination: &Path) -> CoreResult<()>;
}
```

- Modrinth `project_type=resourcepack|shader`。
- CurseForge `classId` 区分资源包/光影。
- 目标目录：`resourcepacks/`、`shaderpacks/`；安装后不自动启用，由用户在游戏内选择。
- 所有下载经 `SourceRegistry`。

### 3.4 OptiFine 本地安装（P1 基础实现）

已接入本地引导安装：选择官方 OptiFine installer jar → 用本机 Java 启动官方安装器 → 通过临时 `%APPDATA%\.minecraft` junction 指向启动器共享版本目录 → 用户在安装器点击 Install → 检测生成的 OptiFine profile 并绑定当前实例。

边界：官方 installer 没有稳定无人值守 CLI，因此这不是“静默一键安装”；不随启动器分发 OptiFine，也不自动下载 installer。junction 清理已做防递归保护。

#### 原始自动安装设计边界

- OptiFine 不允许随启动器分发；采用“用户选择官方下载的 installer jar”或官方页面跳转后的本地文件。
- 流程：校验 jar 是 OptiFine installer → 选择匹配 MC 版本 → 执行 `java -jar` 到临时目录 → 把生成的版本放入共享 versions → 创建实例。
- 不伪造“一键下载”绕过官方分发条款；UI 必须说明来源和许可。
- 实现顺序：本地 jar 选择 → 版本匹配 → 安装器执行 → 启动验证。

### 3.5 多下载源与镜像

现状：Rust `DownloadConfig` 已有 `default_source/mirrors/proxy/offline`，Modrinth source 已实现；Electron 的 Modrinth/CurseForge 仍是独立 TS 请求。

P1 统一方案：

```rust
pub struct DownloadConfig {
    pub default_source: String,
    pub offline: bool,
    pub proxy: Option<String>,
    pub mirrors: Vec<String>,
    pub retry: RetryPolicy,
}

pub trait DownloadSource {
    fn id(&self) -> &str;
    fn search(&self, options: &SearchOptions) -> CoreResult<Vec<ModCandidate>>;
    fn resolve(&self, project_id: &str, kind: ProjectKind) -> CoreResult<ResolvedProject>;
    fn download(&self, resolved: &ResolvedProject, destination: &Path) -> CoreResult<()>;
}
```

- 默认：Mojang 官方元数据；BMCLAPI 镜像仅作为可替换的元数据源；Modrinth 官方 API；CurseForge 通过 MCIM 公共镜像。
- 镜像失败按顺序重试，但用户自定义镜像必须显式确认。
- 代理统一进入 `ureq::Proxy` 或 Electron net 选项；禁止在业务模块里直接发请求。
- 先迁移元数据/模组下载，再迁移资源包/光影和更新 feed。

### 3.6 P1 实施顺序

1. `DownloadSource` 的 `ProjectKind` 与镜像/代理策略（底座）。
2. `.mrpack` 导入 + 仅模组列表导出。
3. 资源包/光影搜索安装。
4. 自动更新器（feed → 校验 → NSIS 替换）。
5. OptiFine 本地 installer 流程。

---

### 3.5 网络设置现状

设置页已加入 HTTP(S) 代理、Modrinth API 基址、CurseForge API 基址；启动和保存时配置 undici 全局 dispatcher 与 xmcl 下载 dispatcher，并持久化。

仍未完成：Mojang 元数据、Java 下载、Microsoft OAuth 等全部路径尚未统一迁移；当前是“可配置代理 + 可替换 API 基址”的基础层，不是完整的单一 Source 架构。

## 4. P2：联机体验最后一公里

现有能力：`multiplayerManager` 已有 host/guest/stop、房间码、地址、玩家数、SCF 中继；UI 在房间联机页。

### 4.1 主界面入口

- Home 页与实例卡片增加「创建房间 / 加入房间」；加入输入框支持粘贴 `U/XXXX-...` 并即时校验。
- 复用 `startHost({ mcPort, playerName })` / `startGuest({ roomCode, playerName })`。
- 不在 P2 引入自建信令/中转；继续 EasyTier 公共节点。

### 4.2 状态面板

```ts
interface MultiplayerSummary {
  active: boolean
  role?: 'host' | 'guest'
  phase: 'idle' | 'starting' | 'ready' | 'error'
  roomCode?: string
  localAddress?: string
  players: number
  path: 'direct' | 'relay' | 'unknown'
  latencyMs?: number
  relay?: string
  detail?: string
}
```

- 面板默认折叠，展开显示 relay/endpoint、端口、最近错误。
- 延迟由连接器/SCF 心跳提供；没有可靠数据时显示“未知”，不伪造。
- P2 IPC：`multiplayer:summary`、`multiplayer:copy-room`、`multiplayer:parse-room`、`multiplayer:diagnostics`.

### 4.3 诊断与反馈（基础已接入）

当前 MultiplayerPage 已有「导出网络摘要」，输出 appVersion/platform/relays/state JSON 到剪贴板；不包含令牌或世界路径。延迟和直连/中继仍需连接器上报。


- 一键导出 JSON：房间角色、阶段、房间码脱敏、relay、地址族、错误、启动器版本、OS 版本、连接器版本、时间。
- 不包含令牌、玩家 UUID、世界路径。
- 覆盖失败边界：对称 NAT、严格防火墙、IPv6-only、公司代理、公共节点不可达。

---

## 5. P3：长期差异化

### 5.1 插件契约（P3 基础已接入）

设置页读取 `<data>/plugins/*/manifest.json`，经 Rust `validate_manifest` 校验版本、ID、权限后列出；不执行插件代码。


现有 `plugin_api.rs`：

```rust
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub api_version: String, // semver；host 1.0.0
    pub kind: PluginKind,
    pub permissions: Vec<Permission>,
}

pub enum Permission { ReadLogs, ModifyMods, Network, ReadAccountMetadata }

pub trait CrashAnalyzerPlugin { fn manifest(&self) -> &PluginManifest; ... }
pub trait DownloadSourcePlugin { fn manifest(&self) -> &PluginManifest; ... }
pub trait AccountProviderPlugin { fn manifest(&self) -> &PluginManifest; ... }
```

最小落地：只加载 `<data>/plugins/*/manifest.json`；API major 必须匹配，权限在调用前校验；插件进程隔离/商店不在 P3 范围。下载源插件只能返回数据，实际 HTTP 仍由 host 执行，避免插件绕过代理/离线策略。

### 5.2 Windows 代码签名

1. 购买 OV/EV Authenticode 证书（EV 对 SmartScreen 声誉更快）。
2. CI 用 Azure Trusted Signing 或硬件令牌/密钥库；不把 PFX 明文入库。
3. 对 `Fangjie.exe` 和 NSIS 安装包分别签名；使用 RFC3161 时间戳。
4. `signtool sign /fd SHA256 /tr <timestamp> /td SHA256 /a ...`；安装器签名后再计算 SHA256。
5. SmartScreen 仍可能对新证书提示；持续发布、稳定 publisher name、EV 证书和下载量建立声誉。不能承诺“签名即无警告”。

### 5.3 完全离线模式（P3 基础已接入）

设置页全局开关；Electron 中央 IPC 网络门禁 + Rust `SourceRegistry::set_offline`。已阻止版本列表、模组/资源包安装、登录、更新、联机、整合包导入等入口。


- Rust `SourceRegistry::set_offline(true)` 已具备运行时门禁；P3 需要 Electron 全局开关并接入所有路径：版本元数据、Java、模组、资源包、光影、更新、联机资源。
- 离线时允许本地实例、本地模组、本地 Java、已缓存文件；禁止非必要请求。
- 设置页明确显示“离线模式”，并在尝试联网操作时给出原因。

### 5.4 跨机器 NAT 实测清单

- 家庭 NAT + 双方 IPv4，公共 relay。
- 对称 NAT / 双重 NAT / CGNAT。
- Windows Defender 防火墙“公用网络”严格模式。
- 公司代理、UDP 受限、仅 TCP。
- IPv6-only 与双栈。
- 一台机器休眠/切换网络后重连。
- relay 节点不可达时回退另一个公共节点。
- 记录：房间码、角色、时间、relay、错误阶段、连接器日志摘要；脱敏后归档。

---

代码签名细节：[code-signing.md](code-signing.md)

NAT 验证矩阵：[nat-test-matrix.md](nat-test-matrix.md)

## 6. 验收对照

| 验收项 | 状态 | 证据/说明 |
| --- | --- | --- |
| 崩溃修复前 diff、修复后回滚 | **P0 已满足** | E2E：diff 1 行 → apply → rollback；备份目录 receipt |
| 批量启停按实例隔离 | **P0 已满足** | E2E：副本禁用 sodium，源实例仍启用 |
| 复制实例源零污染 | **P0 已满足** | Rust 深拷贝 + 源只读；实例文件状态验证 |
| Flight Recorder CSV/折线图 | **P0 已满足（读取/导出）** | 两张 SVG 图、CSV 导出 255 bytes；无内置采样器 |
| OptiFine 本地安装 | **P1 基础实现** | 官方 installer 引导 + junction + profile 检测；非静默无人值守 |
| 自动更新器检测/下载/校验/替换 | **P1 基础实现** | 检查/下载/SHA256/NSIS spawn 已接入；真实安装包替换与签名未实测 |
| .mrpack/.zip 导入、仅模组导出 | **P1 基础实现** | 模组列表导出、`.mrpack` 与 CurseForge `.zip` 导入已接入；zip 文件下载未用真实包复测 |
| 资源包/光影不跳浏览器 | **P1 基础实现** | Modrinth 安装实测；CurseForge 搜索实测；统一源/镜像未迁移 |
| 下载源可替换、默认可用 | **P1 基础实现** | 代理 + Modrinth/CurseForge 基址可配置；并非所有网络路径已统一 |
| 房间码主界面入口 | **P2 基础实现** | 首页快捷房间卡：创建/粘贴自动分段/加入；未自动启动游戏 |
| 联机状态面板直连/中继/延迟 | **P2 基础实现** | 状态字段/摘要已接入；延迟为公共中继 TCP 测量，P2P 直连状态仍由连接器上报 |
| 插件版本/权限 | **P3 基础实现** | 本地 `plugins/*/manifest.json` 经 Rust 校验后列出；只加载清单，不执行第三方代码 |
| 离线无非必要请求 | **P3 基础实现** | Electron 中央 IPC 门禁 + Rust `SourceRegistry`；版本/模组/资源包/登录/更新/联机/导入入口已阻止 |
| 代码签名/SmartScreen | **P3 流程+脚本** | `scripts/sign-windows.ps1` 与 `docs/code-signing.md`；证书/CI 未配置 |

**结论：P0 验收项已完成；P1/P2/P3 未伪装成完成。** 这是硬约束“不得把 P1/P2/P3 强行塞进 P0”的直接结果。

---

## 7. 已知限制

- Rust sidecar 需要先 `npm run build:core`；发布工作流会构建 release 版本。未带 sidecar 的开发构建会显示明确错误。
- 修复 receipt 在 sidecar 进程内；应用重启后备份仍在，但当前 UI 不能跨重启列出旧 receipt。P1 应加 receipt 索引。
- P0 自动修复不处理 Java/内存动作，避免 Rust `instance.json` 与 Electron `config.json` 双写；这两项通过实例设置手动修改。
- Flight Recorder 的 CSV 采样器尚未接入游戏进程；UI 是读写接口与可视化。
- P1/P2/P3 的接口可能随实现调整，但版本/权限、可回滚、统一网络入口三条硬约束不变。
