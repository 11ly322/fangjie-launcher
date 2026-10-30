import { contextBridge, ipcRenderer } from 'electron'
import type {
  Account,
  AppSnapshot,
  Bootstrap,
  CreateInstanceInput,
  InstalledMod,
  Instance,
  InstallModResult,
  CoreDiagnosisBundle,
  CoreFlightSeries,
  CoreInstanceTemplate,
  CoreRepairPlan,
  CoreRepairReceipt,
  CoreStatus,
  CoreModListExport,
  CoreModpackReport,
  CoreUpdateAsset,
  CoreUpdateCheck,
  JavaStatus,
  LaunchState,
  LauncherApi,
  LoaderAvailability,
  LogLine,
  ModBackupEntry,
  ModProject,
  ModSearchOptions,
  ModSearchResponse,
  ModSource,
  ModUpdatePreference,
  ModUpdateReport,
  ModUpdateResult,
  ModVersion,
  MultiplayerDiagnostics,
  ProjectType,
  PluginRecord,
  OptiFineInstallResult,
  MultiplayerState,
  Result,
  Settings,
  SnapshotMeta,
  SnapshotPreview,
  SnapshotRestoreResult,
  StartGuestInput,
  StartHostInput,
  TaskView,
  UpdateInstanceInput,
  VersionSummary
} from '../shared/types'

async function invoke<T>(channel: string, ...args: unknown[]): Promise<Result<T>> {
  try {
    return (await ipcRenderer.invoke(channel, ...args)) as Result<T>
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: LauncherApi = {
  bootstrap: () => invoke<Bootstrap>('app:bootstrap'),
  snapshot: () => invoke<AppSnapshot>('app:snapshot'),
  versions: (includeSnapshots) =>
    invoke<{ versions: VersionSummary[]; latest: { release?: string; snapshot?: string } }>(
      'versions:list',
      includeSnapshots
    ),
  refreshJava: () => invoke<JavaStatus>('java:refresh'),
  onJavaUpdated: (callback) => subscribe<JavaStatus>('java:updated', callback),
  updateSettings: (patch: Partial<Settings>) => invoke<Settings>('settings:update', patch),
  updateAccount: (name: string) => invoke<Account>('account:update', name),
  loginMicrosoft: () => invoke<Account>('auth:microsoft-login'),
  logoutAccount: () => invoke<Account>('auth:logout'),
  chooseSkin: (model: 'classic' | 'slim') => invoke<Account | null>('skin:choose', model),
  applySkin: (instanceId: string) =>
    invoke<{ instanceId: string; fileName: string }>('skin:apply', instanceId),
  chooseJava: () => invoke<string | null>('java:choose'),
  createInstance: (input: CreateInstanceInput) =>
    invoke<{ instance: Instance; taskId: string }>('instances:create', input),
  instanceDetail: (id: string) => invoke<Instance>('instances:detail', id),
  loaderAvailability: (mcVersion: string) =>
    invoke<LoaderAvailability[]>('loaders:availability', mcVersion),
  downloadModFile: (request: import('../shared/types').StandaloneModDownloadRequest) =>
    invoke<import('../shared/types').StandaloneModDownloadResult>('mods:download-file', request),
  installLoaderStandalone: (request: import('../shared/types').StandaloneLoaderInstallRequest) =>
    invoke<import('../shared/types').StandaloneLoaderInstallResult>('loaders:install-standalone', request),
  updateInstance: (id: string, patch: UpdateInstanceInput) =>
    invoke<Instance>('instances:update', id, patch),
  deleteInstance: (id: string, keepSnapshots?: boolean) =>
    invoke<void>('instances:delete', id, keepSnapshots),
  launchInstance: (id: string) => invoke<LaunchState>('instances:launch', id),
  stopInstance: (id: string) => invoke<void>('instances:stop', id),
  openInstanceFolder: (id: string) => invoke<void>('instances:open-folder', id),
  openDataFolder: () => invoke<void>('app:open-data'),
  chooseDataFolder: () => invoke<string | null>('app:choose-data-folder'),
  changeDataLocation: (targetPath: string) =>
    invoke<{ path: string }>('app:change-data-location', targetPath),
  restartApp: () => invoke<void>('app:relaunch'),
  coreStatus: () => invoke<CoreStatus>('core:status'),
  diagnoseCrash: (instanceId: string) =>
    invoke<CoreDiagnosisBundle>('crash:diagnose', instanceId),
  previewCrashRepair: (instanceId: string) =>
    invoke<CoreRepairPlan>('crash:preview', instanceId),
  applyCrashRepair: (planId: string) =>
    invoke<CoreRepairReceipt>('crash:apply', planId),
  rollbackCrashRepair: (repairId: string) =>
    invoke<CoreRepairReceipt>('crash:rollback', repairId),
  setModsEnabledBatch: (instanceId: string, fileNames: string[], enabled: boolean) =>
    invoke<InstalledMod[]>('mods:set-enabled-batch', instanceId, fileNames, enabled),
  copyInstance: (instanceId: string, name: string) =>
    invoke<Instance>('instances:copy', instanceId, name),
  saveInstanceTemplate: (instanceId: string) =>
    invoke<CoreInstanceTemplate>('instances:save-template', instanceId),
  flightSeries: (instanceId: string) =>
    invoke<CoreFlightSeries>('flight:series', instanceId),
  exportFlightCsv: (instanceId: string) =>
    invoke<string | null>('flight:export', instanceId),
  exportModList: (instanceId: string) =>
    invoke<string | null>('instances:export-mod-list', instanceId),
  importModpack: (instanceId: string) =>
    invoke<{ path: string; report: CoreModpackReport } | null>('instances:import-modpack', instanceId),
  installOptiFine: (instanceId: string) =>
    invoke<OptiFineInstallResult | null>('instances:install-optifine', instanceId),
  pluginsList: () => invoke<PluginRecord[]>('plugins:list'),
  openPluginsFolder: () => invoke<void>('plugins:open-folder'),
  updateCheck: () => invoke<CoreUpdateCheck>('update:check'),
  updateDownload: (asset: CoreUpdateAsset) => invoke<string>('update:download', asset),
  updateApply: (installerPath: string) => invoke<void>('update:apply', installerPath),
  openLogsFolder: (id: string) => invoke<void>('instances:open-logs', id),
  instanceMods: (id: string) => invoke<InstalledMod[]>('mods:list', id),
  setModEnabled: (id: string, fileName: string, enabled: boolean) =>
    invoke<InstalledMod[]>('mods:set-enabled', id, fileName, enabled),
  removeMod: (id: string, fileName: string) => invoke<InstalledMod[]>('mods:remove', id, fileName),
  checkModUpdates: (instanceId: string) =>
    invoke<ModUpdateReport>('mods:check-updates', instanceId),
  updateMod: (instanceId: string, projectId: string) =>
    invoke<ModUpdateResult>('mods:update', instanceId, projectId),
  setModUpdatePreference: (
    instanceId: string,
    projectId: string,
    action: ModUpdatePreference,
    versionId?: string
  ) =>
    invoke<InstalledMod[]>('mods:update-preference', instanceId, projectId, action, versionId),
  modUpdateBackups: (instanceId: string) =>
    invoke<ModBackupEntry[]>('mods:backups', instanceId),
  rollbackModUpdate: (instanceId: string, backupId: string) =>
    invoke<{ mods: InstalledMod[]; backup: ModBackupEntry }>(
      'mods:rollback',
      instanceId,
      backupId
    ),
  snapshotsList: (instanceId: string) => invoke<SnapshotMeta[]>('snapshots:list', instanceId),
  snapshotsCreate: (instanceId: string, note?: string) =>
    invoke<SnapshotMeta>('snapshots:create', instanceId, note),
  snapshotsPreview: (instanceId: string, snapshotId: string) =>
    invoke<SnapshotPreview>('snapshots:preview', instanceId, snapshotId),
  snapshotsRestore: (instanceId: string, snapshotId: string) =>
    invoke<SnapshotRestoreResult>('snapshots:restore', instanceId, snapshotId),
  snapshotsDelete: (instanceId: string, snapshotId: string) =>
    invoke<void>('snapshots:delete', instanceId, snapshotId),
  searchMods: (query: string, options?: ModSearchOptions) =>
    invoke<ModSearchResponse>('mods:search', query, options || {}),
  getModProject: (idOrSlug: string, instanceId?: string, projectType?: ProjectType) =>
    invoke<{ project: ModProject; versions: ModVersion[] }>('mods:project', idOrSlug, instanceId, projectType),
  installMod: (instanceId: string, projectId: string, versionId?: string, source?: ModSource, force?: boolean) =>
    invoke<InstallModResult>('mods:install', instanceId, projectId, versionId, source, force),
  installAsset: (instanceId: string, projectId: string, projectType, source, versionId?: string) =>
    invoke<{ fileName: string; path: string }>('assets:install', instanceId, projectId, projectType, source, versionId),
  cancelTask: (taskId: string) => invoke<void>('tasks:cancel', taskId),
  clearTasks: () => invoke<void>('tasks:clear'),
  multiplayerState: () => invoke<MultiplayerState>('multiplayer:state'),
  multiplayerDiagnostics: () =>
    invoke<MultiplayerDiagnostics>('multiplayer:diagnostics'),
  multiplayerLatency: () =>
    invoke<{
      relay: { relay: string; latencyMs: number } | null
      address: { address: string; latencyMs: number } | null
    }>('multiplayer:latency'),
  startHost: (input: StartHostInput) => invoke<MultiplayerState>('multiplayer:host', input),
  startGuest: (input: StartGuestInput) => invoke<MultiplayerState>('multiplayer:guest', input),
  stopMultiplayer: () => invoke<MultiplayerState>('multiplayer:stop'),
  copyText: (text: string) => invoke<void>('app:copy-text', text),
  windowAction: (action) => invoke<void>('app:window', action),
  onTasks: (callback: (tasks: TaskView[]) => void) => subscribe('tasks:update', callback),
  onMultiplayerState: (callback: (state: MultiplayerState) => void) =>
    subscribe('multiplayer:state', callback),
  onDataChanged: (callback: (reason: string) => void) => subscribe('data:changed', callback),
  onLaunchState: (callback: (state: LaunchState) => void) => subscribe('launch:state', callback),
  onLog: (callback: (line: LogLine) => void) => subscribe('launch:log', callback),
  onWindowState: (callback: (maximized: boolean) => void) => subscribe('window:state', callback)
}

contextBridge.exposeInMainWorld('fangjie', api)
