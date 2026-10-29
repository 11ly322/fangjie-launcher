import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { join } from 'node:path'
import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
import { migrateDataLocation } from './dataLocation'
import type {
  CreateInstanceInput,
  Result,
  Settings,
  StartGuestInput,
  StartHostInput,
  CoreModListExport,
  UpdateInstanceInput
} from '../shared/types'
import { errorMessage, normalizeJavaPath, scanJavaRuntimes } from './java'
import {
  cachedLatestVersions,
  isGameRunning,
  launchInstance,
  listVersions,
  runningInstanceIds,
  startInstanceInstall,
  stopGame
} from './minecraft'
import { deleteInstanceData, listInstanceMods, removeMod, setModEnabled } from './mods'
import {
  getModProject,
  searchMods,
  startModInstall
} from './modrinth'
import {
  getCurseForgeProject,
  searchCurseForge,
  startCurseForgeInstall
} from './curseforge'
import { normalizeTheme, type LauncherStore } from './store'
import { RustCoreClient, toRustInstance } from './rustCore'
import { assertOnline, isOffline, setOffline } from './networkPolicy'
import { applyUpdate, checkForUpdates, downloadUpdate } from './updateManager'
import { installAsset } from './assets'
import { listPlugins, openPluginsFolder } from './plugins'
import type { TaskManager } from './tasks'
import { COMMUNITY_RELAYS, measureRelayLatency, multiplayerManager } from './multiplayer'

interface IpcContext {
  store: LauncherStore
  tasks: TaskManager
  rustCore: RustCoreClient
  getMainWindow: () => BrowserWindow | null
}

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload)
  }
}

const NETWORK_CHANNELS = new Set([
  'versions:list',
  'instances:create',
  'instances:import-modpack',
  'mods:search',
  'mods:project',
  'mods:install',
  'assets:install',
  'auth:microsoft-login',
  'update:check',
  'update:download',
  'multiplayer:host',
  'multiplayer:guest',
  'crash:preview',
  'crash:apply'
])

function handle<T>(channel: string, callback: (...args: any[]) => Promise<T> | T): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<Result<T>> => {
    try {
      if (isOffline() && NETWORK_CHANNELS.has(channel)) {
        throw new Error('离线模式已开启，已阻止网络请求')
      }
      return { ok: true, value: await callback(...args) }
    } catch (error) {
      return { ok: false, error: errorMessage(error) }
    }
  })
}

export function registerIpcHandlers(context: IpcContext): void {
  const { store, tasks, rustCore, getMainWindow } = context

  const notifyChange = (reason: string): void => {
    broadcast('data:changed', reason)
  }

  tasks.on('update', (list) => {
    broadcast('tasks:update', list)
  })

  handle('auth:microsoft-login', async () => {
    const { loginMicrosoftAccount } = await import('./microsoft')
    const account = await loginMicrosoftAccount(store, getMainWindow())
    notifyChange('account')
    return account
  })

  handle('auth:logout', async () => {
    store.clearMicrosoftAuth()
    notifyChange('account')
    return store.getPublicAccount()
  })

  handle('skin:choose', async (model: 'classic' | 'slim') => {
    const window = getMainWindow()
    const options: OpenDialogOptions = {
      title: '选择 Minecraft 皮肤',
      buttonLabel: '使用这个皮肤',
      properties: ['openFile'],
      filters: [{ name: 'Minecraft 皮肤 (PNG)', extensions: ['png'] }]
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    const { nativeImage } = await import('electron')
    const image = nativeImage.createFromPath(result.filePaths[0])
    if (image.isEmpty()) throw new Error('无法读取这个 PNG 文件')
    const size = image.getSize()
    if (size.width !== 64 || (size.height !== 64 && size.height !== 32)) {
      throw new Error(`皮肤尺寸需要是 64×64（或旧版 64×32），当前是 ${size.width}×${size.height}`)
    }
    const fileName = `${store.config.account.uuid}.png`
    const { writeFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    writeFileSync(join(store.skinsPath, fileName), image.toPNG())
    store.setSkin({ fileName, model: model === 'slim' ? 'slim' : 'classic' })
    notifyChange('account')
    return store.getPublicAccount()
  })

  handle('skin:apply', async (instanceId: string) => {
    const { applySkinToInstance } = await import('./skin')
    const result = await applySkinToInstance(store, instanceId)
    notifyChange('skin-applied')
    return result
  })

  const snapshot = () => ({
    appVersion: app.getVersion(),
    configPath: store.configPath,
    dataPath: store.dataPath,
    settings: store.settings,
    account: store.getPublicAccount(),
    instances: store.instances,
    tasks: tasks.list(),
    runningInstanceIds: runningInstanceIds(),
    latest: cachedLatestVersions()
  })

  handle('app:bootstrap', async () => {
    const java = await scanJavaRuntimes(store)
    return { ...snapshot(), java }
  })

  handle('app:snapshot', async () => snapshot())

  handle('app:copy-text', async (text: string) => {
    clipboard.writeText(text)
  })

  handle('multiplayer:state', async () => multiplayerManager.getState())
  handle('multiplayer:latency', async () => measureRelayLatency())
  handle('multiplayer:diagnostics', async () => ({
    generatedAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    relays: [...COMMUNITY_RELAYS],
    state: multiplayerManager.getState()
  }))
  handle('multiplayer:host', async (input: StartHostInput) => multiplayerManager.startHost(input))
  handle('multiplayer:guest', async (input: StartGuestInput) =>
    multiplayerManager.startGuest(input)
  )
  handle('multiplayer:stop', async () => multiplayerManager.stop())

  handle('app:window', async (action: 'minimize' | 'maximize' | 'close') => {
    const window = getMainWindow()
    if (!window) return
    if (action === 'minimize') window.minimize()
    else if (action === 'maximize') {
      if (window.isMaximized()) window.unmaximize()
      else window.maximize()
    } else if (action === 'close') window.close()
  })

  handle('versions:list', async (includeSnapshots: boolean) => {
    return listVersions(Boolean(includeSnapshots))
  })

  handle('java:refresh', async () => {
    return scanJavaRuntimes(store)
  })

  handle('java:choose', async () => {
    const window = getMainWindow()
    const options: OpenDialogOptions = {
      title: '选择 Java 可执行文件',
      buttonLabel: '使用此 Java',
      properties: ['openFile'],
      filters:
        process.platform === 'win32'
          ? [{ name: 'Java 可执行文件', extensions: ['exe'] }]
          : [{ name: 'Java 可执行文件', extensions: ['*'] }]
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    return normalizeJavaPath(result.filePaths[0])
  })

  handle('settings:update', async (patch: Partial<Settings>) => {
    const safePatch: Partial<Settings> = {}
    if (typeof patch.memoryMb === 'number') safePatch.memoryMb = patch.memoryMb
    if (typeof patch.javaPath === 'string') safePatch.javaPath = patch.javaPath
    if (typeof patch.showSnapshots === 'boolean') safePatch.showSnapshots = patch.showSnapshots
    if (typeof patch.minimizeOnLaunch === 'boolean') safePatch.minimizeOnLaunch = patch.minimizeOnLaunch
    if (typeof patch.downloadConcurrency === 'number') safePatch.downloadConcurrency = patch.downloadConcurrency
    if (typeof patch.offline === 'boolean') safePatch.offline = patch.offline
    if (patch.theme !== undefined) safePatch.theme = normalizeTheme(patch.theme)
    const settings = store.setSettings(safePatch)
    setOffline(settings.offline)
    notifyChange('settings')
    return settings
  })

  handle('account:update', async (name: string) => {
    if (typeof name !== 'string') throw new Error('请输入玩家名')
    const account = store.setAccountName(name)
    notifyChange('account')
    return account
  })

  handle('instances:create', async (input: CreateInstanceInput) => {
    const result = await startInstanceInstall({
      store,
      tasks,
      input,
      onChange: notifyChange
    })
    notifyChange('task')
    return result
  })

  handle('instances:update', async (id: string, patch: UpdateInstanceInput) => {
    if (typeof id !== 'string') throw new Error('无效的实例')
    const instance = store.updateInstance(id, (current) => {
      const name =
        typeof patch.name === 'string' && patch.name.trim()
          ? patch.name.trim().replace(/\s+/g, ' ').slice(0, 32)
          : current.name
      const memory =
        typeof patch.memoryMb === 'number'
          ? Math.min(32768, Math.max(1024, Math.round(patch.memoryMb / 256) * 256))
          : current.memoryMb
      return {
        ...current,
        name,
        memoryMb: memory,
        icon: typeof patch.icon === 'string' ? patch.icon : current.icon,
        accent: typeof patch.accent === 'string' ? patch.accent : current.accent,
        jvmArgs: Array.isArray(patch.jvmArgs)
          ? patch.jvmArgs.filter((arg): arg is string => typeof arg === 'string').slice(0, 64)
          : current.jvmArgs,
        width: typeof patch.width === 'number' ? Math.min(7680, Math.max(320, Math.round(patch.width))) : current.width,
        height: typeof patch.height === 'number' ? Math.min(4320, Math.max(240, Math.round(patch.height))) : current.height
      }
    })
    notifyChange('instance-updated')
    return instance
  })

  handle('instances:delete', async (id: string) => {
    const instance = store.getInstance(id)
    if (!instance) throw new Error('找不到这个实例')
    if (isGameRunning(id)) throw new Error('请先结束正在运行的游戏')
    deleteInstanceData(store, instance)
    store.removeInstance(id)
    notifyChange('instance-deleted')
  })

  handle('instances:launch', async (id: string) => {
    const instance = store.getInstance(id)
    if (!instance) throw new Error('找不到这个实例')
    if (isGameRunning(id)) throw new Error('这个实例已经在运行了')

    try {
      const state = await launchInstance({
        store,
        instance,
        callbacks: {
          onState: (launchState) => {
            broadcast('launch:state', launchState)
            if (launchState.status === 'exited' || launchState.status === 'error') {
              notifyChange('game-exited')
            }
          },
          onLog: (line) => broadcast('launch:log', line)
        }
      })
      if (store.settings.minimizeOnLaunch) {
        getMainWindow()?.minimize()
      }
      notifyChange('game-started')
      return state
    } catch (error) {
      broadcast('launch:state', {
        instanceId: id,
        status: 'error',
        message: errorMessage(error)
      })
      throw error
    }
  })

  handle('instances:stop', async (id: string) => {
    stopGame(id)
    notifyChange('game-stopped')
  })

  handle('instances:open-folder', async (id: string) => {
    const instance = store.getInstance(id)
    if (!instance) throw new Error('找不到这个实例')
    const gamePath = store.ensureInstanceFolders(instance)
    const error = await shell.openPath(gamePath)
    if (error) throw new Error(error)
  })

  handle('instances:open-logs', async (id: string) => {
    const instance = store.getInstance(id)
    if (!instance) throw new Error('找不到这个实例')
    const logsPath = join(store.ensureInstanceFolders(instance), 'logs')
    const error = await shell.openPath(logsPath)
    if (error) throw new Error(error)
  })

  handle('core:status', async () => rustCore.status())

  handle('plugins:list', async () => listPlugins(store, rustCore))
  handle('plugins:open-folder', async () => openPluginsFolder(store))

  handle('update:check', async () => checkForUpdates(rustCore))

  handle('update:download', async (asset) => downloadUpdate(rustCore, asset))

  handle('update:apply', async (installerPath: string) => applyUpdate(installerPath))

  handle('instances:export-mod-list', async (instanceId: string) => {
    const instance = store.getInstance(instanceId)
    if (!instance) throw new Error('找不到这个实例')
    const data = await rustCore.request<CoreModListExport>('export_mod_list', {
      instance: toRustInstance(store, instance)
    })
    const window = getMainWindow()
    const options = {
      title: '导出模组列表',
      defaultPath: instance.name + '-mods.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf8')
    return result.filePath
  })

  handle('flight:export', async (instanceId: string) => {
    const instance = store.getInstance(instanceId)
    if (!instance) throw new Error('找不到这个实例')
    const source = join(store.ensureInstanceFolders(instance), 'logs', 'flight-recorder.csv')
    if (!existsSync(source)) throw new Error('还没有 flight-recorder.csv 可以导出')
    const window = getMainWindow()
    const options = {
      title: '导出 Flight Recorder CSV',
      defaultPath: 'flight-recorder.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    }
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    copyFileSync(source, result.filePath)
    return result.filePath
  })

  handle('crash:diagnose', async (instanceId: string) => {
    const instance = store.getInstance(instanceId)
    if (!instance) throw new Error('找不到这个实例')
    return rustCore.request('diagnose', { instance: toRustInstance(store, instance) })
  })

  handle('crash:preview', async (instanceId: string) => {
    const instance = store.getInstance(instanceId)
    if (!instance) throw new Error('找不到这个实例')
    return rustCore.request('preview_repair', {
      instance: toRustInstance(store, instance),
      options: { disable_conflicts: true, source_id: 'modrinth' }
    })
  })

  handle('crash:apply', async (planId: string) => {
    if (typeof planId !== 'string' || !planId) throw new Error('无效的修复计划')
    const receipt = await rustCore.request('apply_repair', { plan_id: planId, confirmed: true })
    notifyChange('crash-repair')
    return receipt
  })

  handle('crash:rollback', async (repairId: string) => {
    if (typeof repairId !== 'string' || !repairId) throw new Error('无效的修复记录')
    const receipt = await rustCore.request('rollback_repair', { repair_id: repairId })
    notifyChange('crash-rollback')
    return receipt
  })

  handle('mods:set-enabled-batch', async (instanceId: string, fileNames: string[], enabled: boolean) => {
    const instance = store.getInstance(instanceId)
    if (!instance) throw new Error('找不到这个实例')
    const files = Array.isArray(fileNames) ? fileNames.filter((file): file is string => typeof file === 'string') : []
    if (!files.length) return listInstanceMods(store, instance)
    await rustCore.request('set_mods_enabled', {
      instance: toRustInstance(store, instance),
      changes: files.map((file_name) => ({ file_name, enabled: Boolean(enabled) }))
    })
    notifyChange('mods')
    return listInstanceMods(store, instance)
  })

  handle('instances:copy', async (instanceId: string, name: string) => {
    const source = store.getInstance(instanceId)
    if (!source) throw new Error('找不到这个实例')
    if (runningInstanceIds().includes(instanceId)) throw new Error('请先结束正在运行的游戏')
    if (tasks.list().some((task) => task.status === 'queued' || task.status === 'running')) {
      throw new Error('请等待安装或下载任务完成，再复制实例')
    }
    const newName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 32) : source.name + ' 副本'
    const newId = store.createInstanceId()
    const copied = await rustCore.request<{ name: string }>('copy_instance', {
      source: toRustInstance(store, source),
      instances_root: store.instancesPath,
      new_id: newId,
      new_name: newName
    })
    const record = {
      ...source,
      id: newId,
      name: copied.name || newName,
      createdAt: Date.now(),
      lastPlayedAt: undefined,
      totalPlayTimeMs: 0,
      mods: []
    }
    store.addInstance(record)
    store.ensureInstanceFolders(record)
    const installed = listInstanceMods(store, record)
    if (installed.length) store.updateInstance(newId, (current) => ({ ...current, mods: installed }))
    notifyChange('instance-copied')
    return { ...record, mods: installed }
  })

  handle('instances:import-modpack', async (instanceId: string) => {
    const instance = store.getInstance(instanceId)
    if (!instance) throw new Error('找不到这个实例')
    const window = getMainWindow()
    const options = {
      title: '选择 Modrinth 整合包',
      filters: [{ name: 'Modrinth Modpack', extensions: ['mrpack'] }],
      properties: ['openFile' as const]
    }
    const picked = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    if (picked.canceled || !picked.filePaths[0]) return null
    const report = await rustCore.request('import_modpack', {
      instance: toRustInstance(store, instance),
      archive_path: picked.filePaths[0]
    })
    notifyChange('modpack-imported')
    return { path: picked.filePaths[0], report }
  })

  handle('instances:save-template', async (instanceId: string) => {
    const instance = store.getInstance(instanceId)
    if (!instance) throw new Error('找不到这个实例')
    const templateId = 'tpl-' + Date.now().toString(36)
    const template = await rustCore.request('save_template', {
      instance: toRustInstance(store, instance),
      templates_root: join(store.dataPath, 'templates'),
      template_id: templateId
    })
    notifyChange('template-saved')
    return template
  })

  handle('flight:series', async (instanceId: string) => {
    const instance = store.getInstance(instanceId)
    if (!instance) throw new Error('找不到这个实例')
    const logs = join(store.ensureInstanceFolders(instance), 'logs')
    return rustCore.request('flight_series', {
      csv_path: join(logs, 'flight-recorder.csv')
    })
  })

  handle('app:open-data', async () => {
    const error = await shell.openPath(store.dataPath)
    if (error) throw new Error(error)
  })

  handle('app:choose-data-folder', async () => {
    const window = getMainWindow()
    const options: OpenDialogOptions = {
      title: '选择新的游戏数据目录',
      buttonLabel: '使用这个文件夹',
      properties: ['openDirectory', 'createDirectory']
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  handle('app:change-data-location', async (targetPath: string) => {
    if (runningInstanceIds().length > 0) {
      throw new Error('请先结束正在运行的游戏，再更改数据目录')
    }
    if (tasks.list().some((task) => task.status === 'queued' || task.status === 'running')) {
      throw new Error('请等待安装或下载任务完成，再更改数据目录')
    }
    const result = await migrateDataLocation(store, targetPath)
    return result
  })

  handle('app:relaunch', async () => {
    setTimeout(() => {
      app.relaunch()
      app.exit(0)
    }, 300)
  })

  handle('mods:list', async (instanceId: string) => {
    const instance = store.getInstance(instanceId)
    if (!instance) throw new Error('找不到这个实例')
    return listInstanceMods(store, instance)
  })

  handle('mods:set-enabled', async (instanceId: string, fileName: string, enabled: boolean) => {
    const instance = store.getInstance(instanceId)
    if (!instance) throw new Error('找不到这个实例')
    const result = setModEnabled(store, instance, fileName, Boolean(enabled))
    notifyChange('mods')
    return result
  })

  handle('mods:remove', async (instanceId: string, fileName: string) => {
    const instance = store.getInstance(instanceId)
    if (!instance) throw new Error('找不到这个实例')
    const result = removeMod(store, instance, fileName)
    notifyChange('mods')
    return result
  })

  handle(
    'mods:search',
    async (
      query: string,
      options: {
        instanceId?: string
        category?: string
        offset?: number
        limit?: number
        sort?: 'relevance' | 'downloads' | 'newest' | 'updated'
        source?: 'modrinth' | 'curseforge'
        projectType?: 'mod' | 'resourcepack' | 'shader'
      } = {}
    ) => {
      const instance = options.instanceId ? store.getInstance(options.instanceId) : undefined
      if (options.source === 'curseforge') {
        return searchCurseForge({
          query: typeof query === 'string' ? query : '',
          instance,
          category: options.category,
          offset: options.offset,
          limit: options.limit,
          sort: options.sort,
          projectType: options.projectType
        })
      }
      return searchMods({
        query: typeof query === 'string' ? query : '',
        instance,
        category: options.category,
        offset: options.offset,
        limit: options.limit,
        sort: options.sort,
        projectType: options.projectType
      })
    }
  )

  handle('mods:project', async (idOrSlug: string, instanceId?: string, projectType?: 'mod' | 'resourcepack' | 'shader') => {
    const instance = instanceId ? store.getInstance(instanceId) : undefined
    const effective =
      projectType && projectType !== 'mod' && instance
        ? { ...instance, loader: 'vanilla' as const }
        : instance
    if (idOrSlug.startsWith('cf-')) return getCurseForgeProject(idOrSlug, effective)
    return getModProject(idOrSlug, effective, projectType)
  })

  handle('mods:install', async (instanceId: string, projectId: string) => {
    const result = projectId.startsWith('cf-')
      ? await startCurseForgeInstall({
          store,
          tasks,
          instanceId,
          projectId,
          onChange: notifyChange
        })
      : await startModInstall({
          store,
          tasks,
          instanceId,
          projectId,
          onChange: notifyChange
        })
    notifyChange('task')
    return result
  })

  handle(
    'assets:install',
    async (
      instanceId: string,
      projectId: string,
      projectType: 'mod' | 'resourcepack' | 'shader',
      source: 'modrinth' | 'curseforge'
    ) => {
      const result = await installAsset({
        store,
        instanceId,
        projectId,
        projectType,
        source
      })
      notifyChange('assets')
      return result
    }
  )

  handle('tasks:cancel', async (taskId: string) => {
    tasks.cancel(taskId)
  })

  handle('tasks:clear', async () => {
    tasks.clearFinished()
  })

  handle('window:state', async () => {
    return getMainWindow()?.isMaximized() || false
  })
}
