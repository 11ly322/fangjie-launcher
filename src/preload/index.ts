import { contextBridge, ipcRenderer } from 'electron'
import type {
  Account,
  AppSnapshot,
  Bootstrap,
  CreateInstanceInput,
  InstalledMod,
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
  LogLine,
  ModProject,
  ModSearchResponse,
  ModVersion,
  MultiplayerDiagnostics,
  ProjectType,
  PluginRecord,
  MultiplayerState,
  Result,
  Settings,
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
  updateSettings: (patch: Partial<Settings>) => invoke<Settings>('settings:update', patch),
  updateAccount: (name: string) => invoke<Account>('account:update', name),
  loginMicrosoft: () => invoke<Account>('auth:microsoft-login'),
  logoutAccount: () => invoke<Account>('auth:logout'),
  chooseSkin: (model: 'classic' | 'slim') => invoke<Account | null>('skin:choose', model),
  applySkin: (instanceId: string) =>
    invoke<{ instanceId: string; fileName: string }>('skin:apply', instanceId),
  chooseJava: () => invoke<string | null>('java:choose'),
  createInstance: (input: CreateInstanceInput) =>
    invoke<{ instance: Bootstrap['instances'][number]; taskId: string }>('instances:create', input),
  updateInstance: (id: string, patch: UpdateInstanceInput) =>
    invoke<Bootstrap['instances'][number]>('instances:update', id, patch),
  deleteInstance: (id: string) => invoke<void>('instances:delete', id),
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
    invoke<Bootstrap['instances'][number]>('instances:copy', instanceId, name),
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
  searchMods: (query, options) => invoke<ModSearchResponse>('mods:search', query, options || {}),
  getModProject: (idOrSlug: string, instanceId?: string, projectType?: ProjectType) =>
    invoke<{ project: ModProject; versions: ModVersion[] }>('mods:project', idOrSlug, instanceId, projectType),
  installMod: (instanceId: string, projectId: string) =>
    invoke<InstallModResult>('mods:install', instanceId, projectId),
  installAsset: (instanceId: string, projectId: string, projectType, source) =>
    invoke<{ fileName: string; path: string }>('assets:install', instanceId, projectId, projectType, source),
  cancelTask: (taskId: string) => invoke<void>('tasks:cancel', taskId),
  clearTasks: () => invoke<void>('tasks:clear'),
  multiplayerState: () => invoke<MultiplayerState>('multiplayer:state'),
  multiplayerDiagnostics: () =>
    invoke<MultiplayerDiagnostics>('multiplayer:diagnostics'),
  multiplayerLatency: () =>
    invoke<{ relay: string; latencyMs: number } | null>('multiplayer:latency'),
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
