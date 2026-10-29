import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { join } from 'node:path'
import type { CreateInstanceInput, Result, Settings, UpdateInstanceInput } from '../shared/types'
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
import type { LauncherStore } from './store'
import type { TaskManager } from './tasks'

interface IpcContext {
  store: LauncherStore
  tasks: TaskManager
  getMainWindow: () => BrowserWindow | null
}

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload)
  }
}

function handle<T>(channel: string, callback: (...args: any[]) => Promise<T> | T): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<Result<T>> => {
    try {
      return { ok: true, value: await callback(...args) }
    } catch (error) {
      return { ok: false, error: errorMessage(error) }
    }
  })
}

export function registerIpcHandlers(context: IpcContext): void {
  const { store, tasks, getMainWindow } = context

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
    const settings = store.setSettings(safePatch)
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
        accent: typeof patch.accent === 'string' ? patch.accent : current.accent
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

  handle('app:open-data', async () => {
    const error = await shell.openPath(store.dataPath)
    if (error) throw new Error(error)
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
          sort: options.sort
        })
      }
      return searchMods({
        query: typeof query === 'string' ? query : '',
        instance,
        category: options.category,
        offset: options.offset,
        limit: options.limit,
        sort: options.sort
      })
    }
  )

  handle('mods:project', async (idOrSlug: string, instanceId?: string) => {
    const instance = instanceId ? store.getInstance(instanceId) : undefined
    if (idOrSlug.startsWith('cf-')) return getCurseForgeProject(idOrSlug, instance)
    return getModProject(idOrSlug, instance)
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
