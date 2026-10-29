# Fangjie Rust Core

面向 Tauri v2 的启动器核心 crate，包含崩溃诊断、JAR 扫描、可回滚修复、下载源抽象、实例管理、Flight Recorder 与最小插件接口。

> **架构边界（2026-10-30）**：当前发布版实际是 Electron UI + Rust 联机连接器，并非已经迁移完成的 Tauri 应用。本 crate 是按本任务要求新增的 Rust/Tauri 核心，已经通过 `cargo test` 与 `cargo check --features tauri`，但**已通过 JSON-lines sidecar 接入现有 Electron P0 界面**（崩溃诊断、批量模组、实例复制/模板、Flight Recorder）；Tauri 壳迁移仍未完成。P0 接入见 [docs/p0-p3-architecture.md](../docs/p0-p3-architecture.md)。

## 模块结构

```text
rust/fangjie-core/
├── src/
│   ├── crash_diagnosis.rs   # 日志/崩溃报告 → 症状、根因、建议动作
│   ├── mod_scanner.rs       # JAR metadata + Manifest 扫描、缺失前置/重复/冲突
│   ├── repair_engine.rs     # diff 预览、备份、执行、回滚
│   ├── download_source.rs   # DownloadSource trait + Modrinth + fixture
│   ├── instance_manager.rs  # 实例复制、模板、批量启停、模组列表导出
│   ├── flight_recorder.rs   # CSV 采样与折线图数据
│   ├── plugin_api.rs        # 版本约束 + 权限声明的插件接口
│   ├── update_manager.rs    # P1 接口：版本比较 + 更新包 SHA256 校验
│   ├── modpack_importer.rs  # P1 接口：.mrpack / .zip 格式与导入契约
│   ├── bin/fangjie-core-sidecar.rs # Electron JSON-lines 适配器
│   ├── backend.rs           # 共享状态与业务编排
│   └── commands.rs          # Tauri v2 command 适配层（feature = "tauri"）
└── tests/phase1.rs          # 12 个第一阶段验收测试
```

## 第一阶段：崩溃智能诊断 + 一键修复

### 崩溃映射表

| code | 症状示例 | 根因 | 建议动作 |
| --- | --- | --- | --- |
| `missing_dependency` | `Missing or unsupported mandatory dependencies` / `NoClassDefFoundError` | 缺失前置或版本不满足 | 自动解析并下载前置 |
| `duplicate_mods` | `Duplicate mods found` | 同一 mod id 多个 JAR | 保留一个、禁用其余 |
| `optifine_render_conflict` | `OptiFine` + `Sodium/Iris` | 渲染管线互斥 | 禁用 OptiFine 或 Sodium/Iris |
| `java_version_mismatch` | `UnsupportedClassVersionError` / `requires Java 21` | Java 版本过低 | 切换实例 Java 路径 |
| `out_of_memory` | `OutOfMemoryError: Java heap space` | 最大堆不足 | 提高实例内存 |
| `loader_version_mismatch` | `Incompatible mod set` / `ModResolutionException` | 加载器/游戏/模组版本范围不一致 | 调整加载器或模组版本 |
| `config_corruption` | `JsonParseException` / `TOML parse error` | 配置文件损坏 | 备份并重置配置 |
| `resource_pack_missing` | `Failed to load resource pack` / `pack.mcmeta` | 资源包/数据包缺少依赖 | 检查资源包完整性 |
| `mixin_apply_failure` | `Mixin apply failed` | Mixin 与当前版本不匹配 | 禁用最近/冲突模组 |
| `graphics_driver` | `GLFW error` / OpenGL 失败 | 驱动或渲染上下文问题 | 更新驱动/切换渲染器 |

`diagnose()` 同时扫描 `latest.log` 与最新的 `crash-reports/*.txt`，并合并 `ModScanReport` 的结构化证据。置信度与 severity 在 `Diagnosis` 中返回。

### JAR 扫描

支持读取：

- `fabric.mod.json` 的 `depends` / `provides`
- `quilt.mod.json` 的 `quilt_loader.depends`
- `META-INF/mods.toml` / `META-INF/neoforge.mods.toml`
- `mcmod.info`
- `META-INF/MANIFEST.MF`（Implementation-Title 兜底）

输出缺失前置、重复 mod id、完全重复 JAR、Sodium/Embeddium 重叠、OptiFine 渲染冲突、Fabric/Forge 混放。

### Diff、确认与回滚

```rust
let plan = backend.preview_repair("instance-id", &RepairOptions {
    source_id: Some("modrinth".into()),
    disable_conflicts: true,
    java_path: Some(java_path),
    memory_mb: Some(8192),
    config_relative: Some("options.txt".into()),
    config_replacement: None,
})?;

// UI 展示 plan.diff（Create / Modify / Rename / Delete + before/after）
let receipt = backend.apply_repair(&plan.id, true)?; // confirmed=false 会返回 ConfirmationRequired
backend.rollback_repair(&receipt.repair_id)?;
```

- 备份目录：`<instance>/.fangjie/backups/<repair_id>/`
- 每个修复写入 `receipt.json`；下载写入 `Created`，冲突禁用写入 `Renamed`，实例/配置修改写入 `Modified/Reset`。
- 所有修改前先复制备份；回滚按逆序恢复，删除新建文件，恢复禁用 JAR，恢复配置与 `instance.json`。
- `preview` 不触碰任何文件；`apply` 必须显式 `confirmed=true`。

### Tauri command

```rust
#[tauri::command] fn diagnose_crash(state, instance_id) -> Result<DiagnosisBundle, String>
#[tauri::command] fn scan_instance_mods(state, instance_id) -> Result<ModScanReport, String>
#[tauri::command] fn preview_repair(state, instance_id, options) -> Result<RepairPlan, String>
#[tauri::command] fn apply_repair(state, plan_id, confirmed) -> Result<RepairReceipt, String>
#[tauri::command] fn rollback_repair(state, repair_id) -> Result<RepairReceipt, String>
```

注册：

```rust
let backend = Backend::new(data_root, DownloadConfig::default())?;
tauri::Builder::default()
    .manage(BackendState::new(backend))
    .invoke_handler(tauri::generate_handler![
        commands::list_instances,
        commands::diagnose_crash,
        commands::scan_instance_mods,
        commands::preview_repair,
        commands::apply_repair,
        commands::rollback_repair,
        commands::copy_instance,
        commands::set_mods_enabled,
        commands::save_instance_template,
        commands::apply_instance_template,
        commands::export_mod_list,
        commands::start_flight_recorder,
        commands::record_frame_sample,
        commands::flight_chart,
        commands::set_offline_mode,
        commands::register_plugin_manifest,
    ])
    .run(tauri::generate_context!())?;
```

## 第二阶段：实例与模组

已提供最小实现：

- `InstanceManager::copy_instance`：深复制，跳过 `.fangjie` 备份目录；源实例只读，复制后改新 id/name，原实例零污染。
- `InstanceTemplate` / `save_template` / `apply_template_metadata`：保存 JVM 参数、内存、窗口尺寸、模组文件列表；模板应用只改元数据，避免静默改模组。
- `set_mods_enabled` command：批量勾选启用/禁用，冲突目标先全量校验再统一 rename。
- `export_mod_list`：轻量导出模组文件名、mod id、名称、版本、SHA1，不打包 JAR。

模组安装链：

```text
DownloadSource::search
  → DownloadSource::resolve_dependency / resolve version
  → SourceRegistry::download (统一代理/镜像/离线门禁)
  → mods/<file>
  → ModScanner::scan
  → 缺失前置递归补齐
  → Launch
```

Modrinth 默认源已实现；CurseForge 通过实现同一 `DownloadSource` trait 接入，避免 UI 直接发网络请求。阶段二需要补充 CurseForge source 与安装/更新编排。

## 第三阶段：性能、插件与离线

### Flight Recorder

```rust
pub struct FrameSample { timestamp_ms, fps, one_percent_low_fps, frame_time_ms }
FlightRecorder::start()/record()/stop()
FlightRecorder::chart_series() -> ChartSeries
```

CSV：`timestamp_ms,fps,one_percent_low_fps,frame_time_ms`；`ChartSeries` 直接给前端折线图。

### 插件接口

```rust
pub struct PluginManifest {
    id, name, version, api_version, kind, permissions: Vec<Permission>
}
pub trait CrashAnalyzerPlugin { fn manifest(&self) -> &PluginManifest; ... }
pub trait DownloadSourcePlugin { ... }
pub trait AccountProviderPlugin { ... }
```

`validate_manifest` 校验 semver API 版本、反向域名 ID、权限声明；`PLUGIN_API_VERSION = "1.0.0"`。未实现插件商店/动态加载沙箱。

### 下载源、镜像、代理、离线

```rust
pub struct DownloadConfig { default_source, offline, proxy, mirrors }
SourceRegistry::new(config)
SourceRegistry::resolve_dependency(...)
SourceRegistry::download(...)
Backend::set_offline_mode(true) / commands::set_offline_mode
```

- 默认 `modrinth` 公共 API；不需要自建服务器。
- `mirrors` 第一个作为 API base（阶段三可扩展为多镜像失败切换）。
- `proxy` 进入 ureq Agent。
- `offline=true` 时 `resolve/download` 返回 `CoreError::Offline`，不发起网络请求。

### 联机 UI

现有 0.0.1-beta 已有房间码创建/加入、玩家数、复制地址。本单机核心未重复实现联机 UI；Tauri 迁移时可将 `commands` 与联机连接器状态合并到同一页面。

## 编译与测试

```powershell
# 本机使用 GNU Rust 时把 MinGW bin 加入 PATH
cargo test --manifest-path rust/fangjie-core/Cargo.toml
cargo check --manifest-path rust/fangjie-core/Cargo.toml --features tauri
```

本机验证（2026-10-30）：

- `cargo test`：12 passed
- `cargo check --features tauri`：Finished（Tauri 2.12.5）
- 测试覆盖 9 种崩溃模式、JAR 扫描、diff、确认门禁、下载、禁用/回滚、配置/Java/内存回滚、实例复制、Flight Recorder、插件版本/权限。

## 验收清单对照

| 验收项 | 实现 |
| --- | --- |
| ≥8 种崩溃模式 | 10 条规则，见映射表 |
| 修复前 diff | `RepairPlan.diff`，`preview_repair` 不写文件 |
| 修复后回滚 | `.fangjie/backups/<id>/receipt.json` + `rollback_repair` |
| 模组安装不跳浏览器 | `DownloadSource` 全后端链路；默认 Modrinth |
| 实例复制零污染 | `copy_instance` 源只读，深复制并生成新 id |
| 下载源可替换 | `DownloadSource` trait + `SourceRegistry` |
| 离线无网络 | `DownloadConfig.offline` + `SourceRegistry` 门禁 |
| 插件版本/权限 | `PluginManifest.api_version` + `permissions` + `validate_manifest` |
| 第一阶段可编译 | `cargo test` / `cargo check --features tauri` 通过 |
