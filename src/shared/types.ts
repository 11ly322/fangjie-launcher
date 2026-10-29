export type LoaderType = 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge'

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

export interface Settings {
  memoryMb: number
  theme: ThemeId
  javaPath: string
  showSnapshots: boolean
  minimizeOnLaunch: boolean
  downloadConcurrency: number
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
  width?: number
  height?: number
  createdAt: number
  lastPlayedAt?: number
  totalPlayTimeMs: number
  mods: InstalledMod[]
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
}

export interface AppSnapshot {
  appVersion: string
  configPath: string
  dataPath: string
  settings: Settings
  account: Account
  instances: Instance[]
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
  error?: string
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
}

export interface UpdateInstanceInput {
  name?: string
  memoryMb?: number
  icon?: string
  accent?: string
  jvmArgs?: string[]
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
  createInstance(input: CreateInstanceInput): Promise<Result<{ instance: Instance; taskId: string }>>
  updateInstance(id: string, patch: UpdateInstanceInput): Promise<Result<Instance>>
  deleteInstance(id: string): Promise<Result<void>>
  launchInstance(id: string): Promise<Result<LaunchState>>
  stopInstance(id: string): Promise<Result<void>>
  openInstanceFolder(id: string): Promise<Result<void>>
  openDataFolder(): Promise<Result<void>>
  openLogsFolder(id: string): Promise<Result<void>>
  instanceMods(id: string): Promise<Result<InstalledMod[]>>
  setModEnabled(id: string, fileName: string, enabled: boolean): Promise<Result<InstalledMod[]>>
  removeMod(id: string, fileName: string): Promise<Result<InstalledMod[]>>
  searchMods(query: string, options?: { instanceId?: string; category?: string; offset?: number; limit?: number; sort?: 'relevance' | 'downloads' | 'newest' | 'updated'; source?: ModSource }): Promise<Result<ModSearchResponse>>
  getModProject(idOrSlug: string, instanceId?: string): Promise<Result<{ project: ModProject; versions: ModVersion[] }>>
  installMod(instanceId: string, projectId: string): Promise<Result<InstallModResult>>
  cancelTask(taskId: string): Promise<Result<void>>
  clearTasks(): Promise<Result<void>>
  multiplayerState(): Promise<Result<MultiplayerState>>
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
