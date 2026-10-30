import type { ModSearchOptions } from './modSearch'

export type { ModSearchOptions } from './modSearch'

export type LoaderType = 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge'

export type ProjectType = 'mod' | 'resourcepack' | 'shader' | 'modpack'
export type ModSource = 'modrinth' | 'curseforge'

export type TaskKind = 'instance' | 'mod' | 'java' | 'repair'

export type TaskStatus = 'queued' | 'running' | 'success' | 'error' | 'cancelled'

export interface TaskView {
  id: string
  kind: TaskKind
  title: string
  subtitle: string
  detail: string
  progress: number
  status: TaskStatus
  createdAt: number
  endedAt?: number
  error?: string
  instanceId?: string
  projectId?: string
  bytesPerSecond?: number
}

export interface AccountSkin {
  dataUrl: string
  fileName: string
  model: 'classic' | 'slim'
  appliedInstanceIds: string[]
}

export interface Account {
  name: string
  uuid: string
  type: 'offline' | 'microsoft'
  skin?: AccountSkin
}

export type ThemeId = 'moss' | 'ocean' | 'ember'
export type ColorMode = 'dark' | 'light'
export type MemoryPreset = 'balanced' | 'g1gc' | 'lowlatency' | 'zgc'

export interface Settings {
  memoryMb: number
  theme: ThemeId
  colorMode: ColorMode
  javaPath: string
  showSnapshots: boolean
  minimizeOnLaunch: boolean
  autoSnapshotBeforeLaunch: boolean
  downloadConcurrency: number
  offline: boolean
  proxyUrl: string
  modrinthBase: string
  curseforgeBase: string
}

export interface InstalledMod {
  projectId: string
  slug: string
  title: string
  versionId: string
  versionName: string
  fileName: string
  iconUrl?: string
  enabled: boolean
  installedAt: number
  dependencies?: string[]
  source?: ModSource
  /** When set, the update center never offers a newer version. */
  pinnedVersionId?: string
  /** A single newer version the user explicitly skipped. */
  skippedVersionId?: string
}

export type ModUpdateStatus = 'update' | 'current' | 'unavailable'

export interface ModUpdateEntry {
  projectId: string
  source?: ModSource
  title: string
  fileName: string
  currentVersionId: string
  currentVersionName: string
  latestVersionId?: string
  latestVersionName?: string
  latestVersionNumber?: string
  status: ModUpdateStatus
  reason?: string
  pinned: boolean
  skipped: boolean
  addedDependencies: string[]
  removedDependencies: string[]
}

export interface ModUpdateReport {
  checkedAt: number
  offline: boolean
  entries: ModUpdateEntry[]
  counts: {
    update: number
    current: number
    unavailable: number
    total: number
  }
}

export interface ModUpdateResult {
  projectId: string
  updated: boolean
  taskId?: string
  backupId?: string
  fromVersionId?: string
  toVersionId?: string
  rolledBack?: boolean
}

export type ModUpdatePreference = 'skip' | 'pin' | 'unpin' | 'unskip'

export interface ModBackupEntry {
  id: string
  projectId: string
  title: string
  fileName: string
  versionId: string
  versionName: string
  source?: ModSource
  createdAt: number
  status: 'committed' | 'rolled_back'
  rolledBackAt?: number
  updatedVersionId?: string
}

export type SnapshotKind = 'manual' | 'auto' | 'safety'

export interface SnapshotWorld {
  name: string
  bytes: number
}

export interface SnapshotMeta {
  schemaVersion: 1
  id: string
  instanceId: string
  createdAt: number
  kind: SnapshotKind
  note: string
  size: number
  totalBytes: number
  fileCount: number
  modsCount: number
  gameVersion: string
  loader: LoaderType
  loaderVersion?: string
  javaPath: string
  worlds: SnapshotWorld[]
  configFiles: number
  available: boolean
}

export type SnapshotDiffAction = 'create' | 'overwrite' | 'unchanged'

export interface SnapshotDiffItem {
  path: string
  kind: 'world' | 'config' | 'file'
  action: SnapshotDiffAction
  incomingBytes: number
  existingBytes?: number
}

export interface SnapshotPreview {
  snapshot: SnapshotMeta
  items: SnapshotDiffItem[]
  createCount: number
  overwriteCount: number
  unchangedCount: number
  gameRunning: boolean
  canRestore: boolean
  blockedReason?: string
}

export interface SnapshotRestoreResult {
  snapshot: SnapshotMeta
  safetySnapshotId: string
  restoredFiles: number
  restoredBytes: number
}

export interface Instance {
  id: string
  name: string
  mcVersion: string
  loader: LoaderType
  loaderVersion?: string
  versionId: string
  icon: string
  accent: string
  memoryMb?: number
  jvmArgs?: string[]
  gameArgs?: string[]
  preLaunchCommand?: string
  javaPath?: string
  memoryPreset?: MemoryPreset
  versionIsolation?: boolean
  disableJavaLaunchWrapper?: boolean
  disableLwjglUnsafeAgent?: boolean
  highPerformanceGpu?: boolean
  width?: number
  height?: number
  createdAt: number
  lastPlayedAt?: number
  totalPlayTimeMs: number
  mods: InstalledMod[]
}

export interface InstanceSummary extends Omit<Instance, 'mods'> {
  modCount: number
}

export interface VersionSummary {
  id: string
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha' | string
  releaseTime: string
}

export interface JavaRuntime {
  path: string
  version: string
  majorVersion: number
  component?: string
  source: 'auto' | 'manual'
}

export interface JavaStatus {
  runtimes: JavaRuntime[]
  configuredPath: string
  error?: string
  fromCache?: boolean
}

export interface LoaderAvailability {
  loader: Exclude<LoaderType, 'vanilla'>
  available: boolean
  latest?: string
  error?: string
}

export interface AppSnapshot {
  appVersion: string
  configPath: string
  dataPath: string
  settings: Settings
  account: Account
  instances: InstanceSummary[]
  tasks: TaskView[]
  runningInstanceIds: string[]
  latest: { release?: string; snapshot?: string }
}

export interface Bootstrap extends AppSnapshot {
  java: JavaStatus
}

export type MultiplayerRole = 'host' | 'guest'
export type MultiplayerPhase = 'idle' | 'starting' | 'ready' | 'error'

export interface MultiplayerState {
  active: boolean
  role?: MultiplayerRole
  phase: MultiplayerPhase
  roomCode?: string
  address?: string
  players: number
  playerName?: string
  mcPort?: number
  path?: 'direct' | 'relay' | 'unknown'
  latencyMs?: number
  relay?: string
  error?: string
}

export interface MultiplayerDiagnostics {
  generatedAt: string
  appVersion: string
  platform: string
  arch: string
  relays: string[]
  relayLatency?: { relay: string; latencyMs: number } | null
  addressLatency?: { address: string; latencyMs: number } | null
  state: MultiplayerState
}

export interface StartHostInput {
  playerName: string
  mcPort: number
}

export interface StartGuestInput {
  playerName: string
  roomCode: string
}

export interface RendererConfig {
  platform: string
  versions: {
    electron: string
    chrome: string
    node: string
  }
}

export interface ModSearchHit {
  project_id: string
  slug: string
  title: string
  description: string
  categories: string[]
  display_categories?: string[]
  client_side: string
  server_side: string
  project_type: string
  downloads: number
  follows: number
  icon_url?: string | null
  date_modified: string
  latest_version?: string
  license?: string
  gallery?: string[]
  versions?: string[]
  loaders?: string[]
  source?: ModSource
  website_url?: string
  author?: string
}

export interface ModSearchResponse {
  hits: ModSearchHit[]
  offset: number
  limit: number
  total_hits: number
}

export interface ModVersionFile {
  url: string
  filename: string
  primary: boolean
  size: number
  hashes: { sha1?: string; sha512?: string }
}

export interface ModDependency {
  version_id: string | null
  project_id: string | null
  file_name: string | null
  dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded'
}

export interface ModVersion {
  id: string
  project_id: string
  name: string
  version_number: string
  version_type: 'release' | 'beta' | 'alpha' | string
  game_versions: string[]
  loaders: string[]
  date_published: string
  downloads: number
  files: ModVersionFile[]
  dependencies: ModDependency[]
}

export interface ModProject extends ModSearchHit {
  body: string
  issues_url?: string | null
  source_url?: string | null
  wiki_url?: string | null
  discord_url?: string | null
}

export interface CompatibleModVersion {
  version: ModVersion
  project: Pick<ModSearchHit, 'project_id' | 'slug' | 'title' | 'icon_url'>
  installed?: boolean
}

export interface StandaloneLoaderInstallRequest {
  mcVersion: string
  loader: Exclude<LoaderType, 'vanilla'>
}

export interface StandaloneLoaderInstallResult {
  versionId: string
  loaderVersion: string
}

export interface StandaloneModDownloadRequest {
  source: ModSource
  projectId: string
  versionId?: string
  projectType?: ProjectType
}

export interface StandaloneModDownloadResult {
  path: string
  fileName: string
  versionId: string
  versionName: string
  title: string
}

export interface InstallModResult {
  taskId: string
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export interface CreateInstanceInput {
  name: string
  mcVersion: string
  loader: LoaderType
  memoryMb: number
  accent?: string
  icon?: string
  versionIsolation?: boolean
}

export interface UpdateInstanceInput {
  name?: string
  memoryMb?: number
  icon?: string
  accent?: string
  jvmArgs?: string[]
  gameArgs?: string[]
  preLaunchCommand?: string
  javaPath?: string
  memoryPreset?: MemoryPreset
  versionIsolation?: boolean
  disableJavaLaunchWrapper?: boolean
  disableLwjglUnsafeAgent?: boolean
  highPerformanceGpu?: boolean
  width?: number
  height?: number
}

export interface LaunchState {
  instanceId: string
  status: 'launching' | 'running' | 'exited' | 'error'
  message?: string
  code?: number
}

export interface LogLine {
  instanceId: string
  line: string
  at: number
}

export interface CoreStatus {
  available: boolean
  path?: string
  error?: string
}

export interface CoreEvidence {
  source: string
  line?: number
  excerpt: string
}

export interface CoreSuggestedAction {
  kind: string
  label: string
  automatic: boolean
}

export interface CoreDiagnosis {
  code: string
  title: string
  severity: 'info' | 'warning' | 'error' | 'critical'
  confidence: number
  root_cause: string
  evidence: CoreEvidence[]
  suggested_actions: CoreSuggestedAction[]
}

export interface CoreScannedMod {
  file_name: string
  enabled: boolean
  mod_id: string
  name: string
  version?: string
  loader?: string
  dependencies: Array<{ id: string; requirement?: string; mandatory: boolean }>
  provides: string[]
  sha1: string
}

export interface CoreScanReport {
  mods: CoreScannedMod[]
  missing_dependencies: Array<{
    mod_file: string
    mod_id: string
    dependency_id: string
    requirement?: string
    mandatory: boolean
  }>
  duplicates: Array<{ mod_id: string; files: string[] }>
  conflicts: Array<{
    code: string
    title: string
    mods: string[]
    severity: 'warning' | 'error'
    suggestion: string
  }>
  warnings: string[]
}

export interface CoreDiagnosisBundle {
  diagnosis: {
    diagnoses: CoreDiagnosis[]
    scanned_at_unix: number
  }
  scan: CoreScanReport
  log_lines: number
  crash_report_found: boolean
}

export interface CoreDiffEntry {
  path: string
  kind: 'create' | 'modify' | 'rename' | 'delete'
  before?: string
  after?: string
  summary: string
}

export interface CoreRepairPlan {
  id: string
  instance_id: string
  actions: Array<Record<string, unknown>>
  diff: CoreDiffEntry[]
  warnings: string[]
  created_at_unix: number
}

export interface CoreRepairReceipt {
  repair_id: string
  plan_id: string
  instance_id: string
  backup_dir: string
  changes: Array<Record<string, unknown>>
  created_at_unix: number
}

export interface CoreInstanceTemplate {
  id: string
  name: string
  jvm_args: string[]
  memory_mb: number
  width?: number
  height?: number
  mod_files: string[]
  loader: LoaderType
  game_version: string
  created_at_unix: number
}

export type PluginKind = 'crash_analyzer' | 'download_source' | 'account_provider'
export type PluginPermission = 'read_logs' | 'modify_mods' | 'network' | 'read_account_metadata'

export interface PluginManifest {
  id: string
  name: string
  version: string
  api_version: string
  kind: PluginKind
  permissions: PluginPermission[]
}

export interface PluginRecord {
  directory: string
  manifest?: PluginManifest
  valid: boolean
  warnings: string[]
  error?: string
}

export interface OptiFineInstallResult {
  versionId: string
  profileName: string
  installerPath: string
}

export interface CoreModpackReport {
  name: string
  version: string
  downloaded: number
  overrides: number
  skipped: number
  warnings: string[]
}

export interface CoreModListExport {
  instance_id: string
  game_version: string
  loader: string
  mods: Array<{
    file_name: string
    mod_id: string
    name: string
    version?: string
    sha1: string
  }>
}

export interface CoreUpdateAsset {
  platform: string
  url: string
  sha256: string
  size: number
  signature?: string
}

export interface CoreUpdateManifest {
  version: string
  channel: 'stable' | 'beta'
  notes: string
  published_at: string
  assets: CoreUpdateAsset[]
}

export interface CoreUpdateCheck {
  current_version: string
  available?: CoreUpdateManifest | null
}

export interface CoreFlightSample {
  timestamp_ms: number
  fps: number
  one_percent_low_fps: number
  frame_time_ms: number
}

export interface CoreFlightSeries {
  path: string
  samples: CoreFlightSample[]
  series: {
    fps: Array<[number, number]>
    one_percent_low_fps: Array<[number, number]>
    frame_time_ms: Array<[number, number]>
  }
}

export type WindowAction = 'minimize' | 'maximize' | 'close'

export interface LauncherApi {
  bootstrap(): Promise<Result<Bootstrap>>
  snapshot(): Promise<Result<AppSnapshot>>
  versions(includeSnapshots: boolean): Promise<Result<{ versions: VersionSummary[]; latest: { release?: string; snapshot?: string } }>>
  refreshJava(): Promise<Result<JavaStatus>>
  onJavaUpdated(callback: (status: JavaStatus) => void): () => void
  updateSettings(patch: Partial<Settings>): Promise<Result<Settings>>
  updateAccount(name: string): Promise<Result<Account>>
  loginMicrosoft(): Promise<Result<Account>>
  logoutAccount(): Promise<Result<Account>>
  chooseSkin(model: 'classic' | 'slim'): Promise<Result<Account | null>>
  applySkin(instanceId: string): Promise<Result<{ instanceId: string; fileName: string }>>
  chooseJava(): Promise<Result<string | null>>
  chooseDataFolder(): Promise<Result<string | null>>
  changeDataLocation(targetPath: string): Promise<Result<{ path: string }>>
  restartApp(): Promise<Result<void>>
  coreStatus(): Promise<Result<CoreStatus>>
  diagnoseCrash(instanceId: string): Promise<Result<CoreDiagnosisBundle>>
  previewCrashRepair(instanceId: string): Promise<Result<CoreRepairPlan>>
  applyCrashRepair(planId: string): Promise<Result<CoreRepairReceipt>>
  rollbackCrashRepair(repairId: string): Promise<Result<CoreRepairReceipt>>
  setModsEnabledBatch(instanceId: string, fileNames: string[], enabled: boolean): Promise<Result<InstalledMod[]>>
  copyInstance(instanceId: string, name: string): Promise<Result<Instance>>
  saveInstanceTemplate(instanceId: string): Promise<Result<CoreInstanceTemplate>>
  flightSeries(instanceId: string): Promise<Result<CoreFlightSeries>>
  exportFlightCsv(instanceId: string): Promise<Result<string | null>>
  exportModList(instanceId: string): Promise<Result<string | null>>
  importModpack(instanceId: string): Promise<Result<{ path: string; report: CoreModpackReport } | null>>
  installOptiFine(instanceId: string): Promise<Result<OptiFineInstallResult | null>>
  pluginsList(): Promise<Result<PluginRecord[]>>
  openPluginsFolder(): Promise<Result<void>>
  updateCheck(): Promise<Result<CoreUpdateCheck>>
  updateDownload(asset: CoreUpdateAsset): Promise<Result<string>>
  updateApply(installerPath: string): Promise<Result<void>>
  createInstance(input: CreateInstanceInput): Promise<Result<{ instance: Instance; taskId: string }>>
  instanceDetail(id: string): Promise<Result<Instance>>
  loaderAvailability(mcVersion: string): Promise<Result<LoaderAvailability[]>>
  downloadModFile(request: StandaloneModDownloadRequest): Promise<Result<StandaloneModDownloadResult>>
  installLoaderStandalone(request: StandaloneLoaderInstallRequest): Promise<Result<StandaloneLoaderInstallResult>>
  updateInstance(id: string, patch: UpdateInstanceInput): Promise<Result<Instance>>
  deleteInstance(id: string, keepSnapshots?: boolean): Promise<Result<void>>
  launchInstance(id: string): Promise<Result<LaunchState>>
  stopInstance(id: string): Promise<Result<void>>
  openInstanceFolder(id: string): Promise<Result<void>>
  openDataFolder(): Promise<Result<void>>
  openLogsFolder(id: string): Promise<Result<void>>
  instanceMods(id: string): Promise<Result<InstalledMod[]>>
  setModEnabled(id: string, fileName: string, enabled: boolean): Promise<Result<InstalledMod[]>>
  removeMod(id: string, fileName: string): Promise<Result<InstalledMod[]>>
  checkModUpdates(instanceId: string): Promise<Result<ModUpdateReport>>
  updateMod(instanceId: string, projectId: string): Promise<Result<ModUpdateResult>>
  setModUpdatePreference(
    instanceId: string,
    projectId: string,
    action: ModUpdatePreference,
    versionId?: string
  ): Promise<Result<InstalledMod[]>>
  modUpdateBackups(instanceId: string): Promise<Result<ModBackupEntry[]>>
  rollbackModUpdate(
    instanceId: string,
    backupId: string
  ): Promise<Result<{ mods: InstalledMod[]; backup: ModBackupEntry }>>
  snapshotsList(instanceId: string): Promise<Result<SnapshotMeta[]>>
  snapshotsCreate(instanceId: string, note?: string): Promise<Result<SnapshotMeta>>
  snapshotsPreview(instanceId: string, snapshotId: string): Promise<Result<SnapshotPreview>>
  snapshotsRestore(instanceId: string, snapshotId: string): Promise<Result<SnapshotRestoreResult>>
  snapshotsDelete(instanceId: string, snapshotId: string): Promise<Result<void>>
  searchMods(query: string, options?: ModSearchOptions): Promise<Result<ModSearchResponse>>
  getModProject(idOrSlug: string, instanceId?: string, projectType?: ProjectType): Promise<Result<{ project: ModProject; versions: ModVersion[] }>>
  installMod(instanceId: string, projectId: string, versionId?: string, source?: ModSource, force?: boolean): Promise<Result<InstallModResult>>
  installAsset(instanceId: string, projectId: string, projectType: ProjectType, source: ModSource, versionId?: string): Promise<Result<{ fileName: string; path: string }>>
  cancelTask(taskId: string): Promise<Result<void>>
  clearTasks(): Promise<Result<void>>
  multiplayerState(): Promise<Result<MultiplayerState>>
  multiplayerDiagnostics(): Promise<Result<MultiplayerDiagnostics>>
  multiplayerLatency(): Promise<Result<{
    relay: { relay: string; latencyMs: number } | null
    address: { address: string; latencyMs: number } | null
  }>>
  startHost(input: StartHostInput): Promise<Result<MultiplayerState>>
  startGuest(input: StartGuestInput): Promise<Result<MultiplayerState>>
  stopMultiplayer(): Promise<Result<MultiplayerState>>
  copyText(text: string): Promise<Result<void>>
  windowAction(action: WindowAction): Promise<Result<void>>
  onTasks(callback: (tasks: TaskView[]) => void): () => void
  onMultiplayerState(callback: (state: MultiplayerState) => void): () => void
  onDataChanged(callback: (reason: string) => void): () => void
  onLaunchState(callback: (state: LaunchState) => void): () => void
  onLog(callback: (line: LogLine) => void): () => void
  onWindowState(callback: (maximized: boolean) => void): () => void
}
