import { accessSync, constants, createWriteStream, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { exec, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { Version, createMinecraftProcessWatcher, launch } from '@xmcl/core'
import {
  getVersionList,
  installTask,
  type MinecraftVersion
} from '@xmcl/installer'
import type { Task } from '@xmcl/task'
import { INSTANCE_ACCENTS, INSTANCE_ICONS, LOADER_LABEL } from '../shared/constants'
import type {
  CreateInstanceInput,
  Instance,
  LaunchState,
  LoaderType,
  LogLine,
  VersionSummary
} from '../shared/types'
import { ensureJavaRuntime, errorMessage, normalizeJavaPath, requiredJavaMajor, scanJavaRuntimes } from './java'
import { installModLoader } from './loaders'
import { XMCL_HEADERS, xmclDownloadAgent } from './downloadAgent'
import { ensureMicrosoftSession } from './microsoft'
import { APP_VERSION } from './version'
import type { LauncherStore } from './store'
import type { TaskManager } from './tasks'
import { requestResponse } from './downloadSource'

const execAsync = promisify(exec)

function memoryPresetArgs(preset: Instance['memoryPreset']): string[] {
  switch (preset) {
    case 'g1gc':
      return ['-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:MaxGCPauseMillis=200']
    case 'lowlatency':
      return ['-XX:+UseG1GC', '-XX:MaxGCPauseMillis=50', '-XX:G1NewSizePercent=30', '-XX:G1MaxNewSizePercent=40']
    case 'zgc':
      return ['-XX:+UseZGC', '-XX:+ZGenerational']
    default:
      return []
  }
}


interface VersionCache {
  at: number
  versions: VersionSummary[]
  latest: { release?: string; snapshot?: string }
  raw: MinecraftVersion[]
}

let versionCache: VersionCache | undefined
let versionFetch: Promise<VersionCache> | undefined

export async function getMinecraftVersions(): Promise<VersionCache> {
  if (versionCache && Date.now() - versionCache.at < 10 * 60 * 1000) return versionCache
  if (versionFetch) return versionFetch
  versionFetch = (async () => {
    const list = await getVersionList()
    const versions: VersionSummary[] = list.versions.map((version) => ({
      id: version.id,
      type: version.type,
      releaseTime: version.releaseTime
    }))
    versionCache = {
      at: Date.now(),
      versions,
      latest: { release: list.latest.release, snapshot: list.latest.snapshot },
      raw: list.versions
    }
    return versionCache
  })()
    .catch((error) => {
      versionFetch = undefined
      throw new Error(`无法读取 Minecraft 版本列表：${errorMessage(error)}`)
    })
    .finally(() => {
      versionFetch = undefined
    })
  return versionFetch
}

export function cachedLatestVersions(): { release?: string; snapshot?: string } {
  return versionCache?.latest || {}
}

export async function listVersions(includeSnapshots: boolean): Promise<{
  versions: VersionSummary[]
  latest: { release?: string; snapshot?: string }
}> {
  const cache = await getMinecraftVersions()
  const versions = includeSnapshots
    ? cache.versions
    : cache.versions.filter((version) => version.type === 'release')
  return { versions, latest: cache.latest }
}

export function randomInstanceLook(seed: string): { accent: string; icon: string } {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 33 + seed.charCodeAt(index)) | 0
  }
  return {
    accent: INSTANCE_ACCENTS[Math.abs(hash) % INSTANCE_ACCENTS.length],
    icon: INSTANCE_ICONS[Math.abs(hash >> 3) % INSTANCE_ICONS.length]
  }
}

export async function startInstanceInstall(options: {
  store: LauncherStore
  tasks: TaskManager
  input: CreateInstanceInput
  onChange: (reason: string) => void
}): Promise<{ instance: Instance; taskId: string }> {
  const { store, tasks, input, onChange } = options

  if (tasks.isRunning('instance')) {
    throw new Error('已有实例正在安装，请等待当前任务完成后再创建')
  }

  const name = input.name.trim().replace(/\s+/g, ' ').slice(0, 32)
  if (!name) throw new Error('请给实例取一个名字')
  if (!input.mcVersion) throw new Error('请选择 Minecraft 版本')
  if (!['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'].includes(input.loader)) {
    throw new Error('不支持的模组加载器')
  }

  const cache = await getMinecraftVersions()
  const versionMeta = cache.raw.find((version) => version.id === input.mcVersion)
  if (!versionMeta) throw new Error('所选 Minecraft 版本不存在，请刷新版本列表')

  const look = randomInstanceLook(`${name}:${input.mcVersion}`)
  const memoryMb = Number(input.memoryMb) || store.settings.memoryMb
  const draft = store.createInstanceRecord({
    name,
    mcVersion: input.mcVersion,
    loader: input.loader,
    versionId: input.mcVersion,
    accent: input.accent || look.accent,
    icon: input.icon || look.icon,
    memoryMb,
    versionIsolation: input.versionIsolation !== false
  })

  const taskId = tasks.create({
    kind: 'instance',
    title: `安装「${name}」`,
    subtitle: `Minecraft ${input.mcVersion} · ${LOADER_LABEL[input.loader] || '原版'}`,
    detail: '准备安装…',
    instanceId: draft.id
  })
  tasks.start(taskId, '准备安装目录…')

  void installInstanceInBackground({
    store,
    tasks,
    taskId,
    draft,
    versionMeta,
    onChange
  }).catch((error) => {
    const task = tasks.get(taskId)
    if (task?.status === 'cancelled') return
    const message = errorMessage(error)
    tasks.fail(taskId, message)
    onChange('task')
  })

  return { instance: draft, taskId }
}

async function installInstanceInBackground(options: {
  store: LauncherStore
  tasks: TaskManager
  taskId: string
  draft: Instance
  versionMeta: MinecraftVersion
  onChange: (reason: string) => void
}): Promise<void> {
  const { store, tasks, taskId, draft, versionMeta, onChange } = options
  const gamePath = store.ensureInstanceFolders(draft)
  const minecraftPath = store.minecraftPath
  const setProgress = (progress: number, detail: string): void => {
    tasks.update(taskId, { progress, detail, status: 'running' })
  }

  tasks.update(taskId, { detail: '正在读取版本信息…', progress: 2 }, { immediate: true })
  const expectedBytes = await estimateVersionBytes(versionMeta.url)
  const vanillaTask = installTask(versionMeta, minecraftPath, {
    side: 'client',
    agent: xmclDownloadAgent,
    headers: XMCL_HEADERS
  })
  tasks.setCancel(taskId, () => vanillaTask.cancel())
  try {
    await runMinecraftTask(vanillaTask, expectedBytes, (percent, detail) => {
      setProgress(4 + percent * 0.44, detail)
    })
  } catch (error) {
    if (tasks.get(taskId)?.status === 'cancelled') return
    throw new Error(`下载游戏文件失败：${errorMessage(error)}`)
  }
  if (tasks.get(taskId)?.status === 'cancelled') return

  let versionId = draft.mcVersion
  let loaderVersion: string | undefined

  setProgress(50, '正在准备 Java 运行时…')
  const resolvedVanilla = await Version.parse(minecraftPath, draft.mcVersion)
  let javaPath: string
  try {
    javaPath = await ensureJavaRuntime({
      store,
      version: resolvedVanilla,
      taskId,
      tasks,
      onProgress: (percent, detail) => {
        setProgress(50 + percent * 0.18, detail)
      }
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'CancelledTaskError') return
    throw new Error(`安装 Java 运行时失败：${errorMessage(error)}`)
  }
  if (!existsSync(javaPath)) throw new Error('Java 安装完成后未能找到可执行文件')
  if (tasks.get(taskId)?.status === 'cancelled') return

  if (draft.loader !== 'vanilla') {
    setProgress(70, `正在安装 ${LOADER_LABEL[draft.loader] || draft.loader} 加载器…`)
    try {
      const result = await installModLoader({
        mcPath: minecraftPath,
        mcVersion: draft.mcVersion,
        loader: draft.loader as Exclude<LoaderType, 'vanilla'>,
        javaPath,
        onDetail: (detail, loaderProgress) => {
          setProgress(70 + (loaderProgress ?? 5) * 0.24, detail)
        },
        onTask: (cancel) => tasks.setCancel(taskId, cancel)
      })
      versionId = result.versionId
      loaderVersion = result.loaderVersion
    } catch (error) {
      if (tasks.get(taskId)?.status === 'cancelled') return
      throw new Error(`安装 ${LOADER_LABEL[draft.loader] || draft.loader} 失败：${errorMessage(error)}`)
    }
  }

  if (tasks.get(taskId)?.status === 'cancelled') return

  const instance = store.addInstance({
    ...draft,
    versionId,
    loaderVersion
  })

  tasks.finish(taskId, `${draft.name} 已准备就绪`, 100)
  onChange('instance-created')
  onChange('task')
  void gamePath
}

async function runMinecraftTask(
  task: Task<any>,
  expectedBytes: number,
  onProgress: (percent: number, detail: string) => void
): Promise<void> {
  let lastEmit = 0
  let downloadedBytes = 0
  await task.startAndWait({
    onUpdate: (child, chunkSize) => {
      if (!isLeafTask(child)) return
      downloadedBytes += Math.max(0, Number(chunkSize) || 0)
      const now = Date.now()
      if (now - lastEmit < 140) return
      lastEmit = now
      const total = Number(task.total) || 0
      const progress = Number(task.progress) || 0
      const percent =
        expectedBytes > 0
          ? Math.min(99, Math.max(0, (downloadedBytes / expectedBytes) * 100))
          : total > 0
            ? Math.min(100, Math.max(0, (progress / total) * 100))
            : 0
      const detail = describeMinecraftStage(child?.path || task.path || '')
      onProgress(
        percent,
        expectedBytes > 0
          ? `${detail} ${formatDownloaded(downloadedBytes, expectedBytes)}`
          : detail
      )
    }
  })
  onProgress(100, '游戏文件准备完成')
}

async function estimateVersionBytes(versionUrl: string): Promise<number> {
  try {
    const response = await requestResponse(versionUrl, { signal: AbortSignal.timeout(20_000) })
    if (!response.ok) return 0
    const version = (await response.json()) as {
      downloads?: { client?: { size?: number } }
      assetIndex?: { totalSize?: number }
      libraries?: Array<{
        downloads?: {
          artifact?: { size?: number }
          classifiers?: Record<string, { size?: number }>
        }
      }>
    }
    let total = version.downloads?.client?.size || 0
    total += version.assetIndex?.totalSize || 0
    for (const library of version.libraries || []) {
      total += library.downloads?.artifact?.size || 0
      for (const [classifier, artifact] of Object.entries(library.downloads?.classifiers || {})) {
        if (classifier.includes(process.platform === 'win32' ? 'windows' : process.platform)) {
          total += artifact.size || 0
        }
      }
    }
    return Math.max(0, total)
  } catch {
    return 0
  }
}

function describeMinecraftStage(path: string): string {
  if (path.includes('assets')) return '正在下载游戏资源…'
  if (path.includes('libraries')) return '正在下载运行库…'
  if (path.includes('jar')) return '正在下载游戏核心…'
  if (path.includes('json')) return '正在读取版本信息…'
  return '正在下载必要文件…'
}

function formatDownloaded(downloaded: number, expected: number): string {
  const toMb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(0)} MB`
  return `${toMb(downloaded)} / ${toMb(expected)}`
}

function isLeafTask(task: Task<any> | undefined): boolean {
  return !Array.isArray((task as unknown as { children?: unknown[] } | undefined)?.children)
}

function replaceLaunchPlaceholders(
  resolved: { arguments?: { game?: any[]; jvm?: any[] } },
  clientId: string,
  xuid: string
): void {
  const replace = (value: string): string =>
    value.replace(/\$\{clientid\}/gi, clientId).replace(/\$\{auth_xuid\}/gi, xuid)
  for (const group of [resolved.arguments?.game, resolved.arguments?.jvm]) {
    if (!Array.isArray(group)) continue
    for (let index = 0; index < group.length; index += 1) {
      const argument = group[index]
      if (typeof argument === 'string') {
        group[index] = replace(argument)
      } else if (argument && typeof argument === 'object' && 'value' in argument) {
        const value = (argument as { value: string | string[] }).value
        argument.value = Array.isArray(value)
          ? value.map((item) => replace(item))
          : replace(String(value))
      }
    }
  }
}

const runningGames = new Map<
  string,
  {
    process: ChildProcess
    startedAt: number
    stopping: boolean
    logPath: string
  }
>()

interface LaunchCallbacks {
  onState: (state: LaunchState) => void
  onLog: (line: LogLine) => void
}

export function isGameRunning(instanceId: string): boolean {
  return runningGames.has(instanceId)
}

export async function launchInstance(options: {
  store: LauncherStore
  instance: Instance
  callbacks: LaunchCallbacks
}): Promise<LaunchState> {
  const { store, instance, callbacks } = options
  if (runningGames.has(instance.id)) {
    throw new Error('这个实例已经在运行了')
  }

  const gamePath = store.ensureInstanceFolders(instance)
  const logDir = join(gamePath, 'logs')
  const logPath = join(logDir, `launcher-${new Date().toISOString().replace(/[:.]/g, '-')}.log`)
  const logStream = createWriteStream(logPath, { flags: 'a' })
  callbacks.onState({ instanceId: instance.id, status: 'launching', message: '正在校验游戏文件…' })

  if (instance.preLaunchCommand?.trim()) {
    callbacks.onState({ instanceId: instance.id, status: 'launching', message: '正在执行启动前命令…' })
    callbacks.onLog({
      instanceId: instance.id,
      line: `[launcher] 执行启动前命令：${instance.preLaunchCommand.trim()}`,
      at: Date.now()
    })
    try {
      const result = await execAsync(instance.preLaunchCommand.trim(), {
        cwd: gamePath,
        timeout: 120000,
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
        env: process.env
      })
      const output = `${result.stdout || ''}${result.stderr || ''}`.trim()
      if (output) {
        logStream.write(`[launcher] 启动前命令输出：\n${output}\n`)
        callbacks.onLog({ instanceId: instance.id, line: output.slice(0, 1200), at: Date.now() })
      }
    } catch (error) {
      logStream.end()
      throw new Error(`启动前命令执行失败：${errorMessage(error)}`)
    }
  }

  let resolved
  try {
    resolved = await Version.parse(store.minecraftPath, instance.versionId)
  } catch (error) {
    logStream.end()
    throw new Error(`游戏版本文件不完整，请重新创建实例：${errorMessage(error)}`)
  }

  const requiredMajor = requiredJavaMajor(resolved)
  const javaStatus = await scanJavaRuntimes(store)
  const selectedJavaPath = normalizeJavaPath(instance.javaPath || '')
  const selectedRuntime = selectedJavaPath
    ? javaStatus.runtimes.find((runtime) => normalizeJavaPath(runtime.path) === selectedJavaPath)
    : undefined
  const configured = javaStatus.configuredPath ? javaStatus.runtimes.find((runtime) => runtime.source === 'manual') : undefined
  const automatic = javaStatus.runtimes.filter((runtime) => runtime.path.includes(`${join('runtime')}`) && runtime.majorVersion === requiredMajor)
  const java =
    (selectedJavaPath && existsSync(selectedJavaPath)
      ? selectedRuntime || { path: selectedJavaPath, majorVersion: requiredMajor, component: 'manual', source: 'manual' as const }
      : undefined) ||
    configured ||
    automatic[0] ||
    javaStatus.runtimes.find((runtime) => runtime.majorVersion === requiredMajor)
  if (!java) {
    logStream.end()
    throw new Error(`没有找到适用于该版本的 Java ${requiredMajor} 运行时，请重新安装实例或前往设置指定 Java 路径`)
  }

  const memory = Math.min(32768, Math.max(1024, instance.memoryMb || store.settings.memoryMb))
  const account = store.getPublicAccount()
  let profile = {
    name: account.name,
    id: account.uuid.replace(/-/g, '')
  }
  let accessToken = 'offline'
  let userType: 'legacy' | 'msa' = 'legacy'
  let xuid: string | undefined

  if (account.type === 'microsoft') {
    try {
      const session = await ensureMicrosoftSession(store)
      profile = {
        name: session.profile.name,
        id: session.profile.id
      }
      accessToken = session.accessToken
      userType = 'msa'
      xuid = session.xuid
    } catch (error) {
      logStream.end()
      throw new Error(`正版账户验证失败：${errorMessage(error)}`)
    }
  }

  replaceLaunchPlaceholders(resolved, profile.id, xuid || '0')

  const presetArgs = memoryPresetArgs(instance.memoryPreset)
  const extraJvmArgs = ['-Dfile.encoding=UTF-8', ...presetArgs, ...(instance.jvmArgs || [])]
  if (instance.disableJavaLaunchWrapper) {
    extraJvmArgs.push('-Dforge.disableLaunchWrapper=true')
  }
  if (instance.disableLwjglUnsafeAgent) {
    extraJvmArgs.push('-Dorg.lwjgl.system.unsafe=false')
  }
  const launchEnv: NodeJS.ProcessEnv = { ...process.env }
  if (instance.highPerformanceGpu) {
    launchEnv.SHIM_MCCOMPAT = '0x800000001'
  }
  callbacks.onLog({
    instanceId: instance.id,
    line: `[launcher] Java ${java.path} · 内存 ${memory} MB · 预设 ${instance.memoryPreset || 'balanced'} · 版本隔离 ${
      instance.versionIsolation === false ? '关闭' : '开启'
    }`,
    at: Date.now()
  })

  try {
    const child = await launch({
      gamePath,
      resourcePath: store.minecraftPath,
      version: resolved,
      javaPath: java.path,
      gameProfile: profile,
      accessToken,
      userType: userType as unknown as 'mojang' | 'legacy',
      launcherName: 'UBL',
      launcherBrand: APP_VERSION,
      versionType:
        instance.loader !== 'vanilla'
          ? `${LOADER_LABEL[instance.loader] || instance.loader} ${instance.loaderVersion || ''}`.trim()
          : 'Release',
      minMemory: 512,
      maxMemory: memory,
      resolution:
        instance.width && instance.height
          ? { width: instance.width, height: instance.height }
          : undefined,
      extraJVMArgs: extraJvmArgs,
      extraMCArgs: instance.gameArgs || [],
      extraExecOption: {
        cwd: gamePath,
        windowsHide: false,
        env: launchEnv
      }
    })

    const entry = {
      process: child,
      startedAt: Date.now(),
      stopping: false,
      logPath
    }
    runningGames.set(instance.id, entry)

    if (store.settings.minimizeOnLaunch) {
      callbacks.onState({ instanceId: instance.id, status: 'running', message: '游戏已启动' })
    } else {
      callbacks.onState({ instanceId: instance.id, status: 'launching', message: '游戏正在启动…' })
    }

    const watcher = createMinecraftProcessWatcher(child)
    let logBuffer = ''

    const pushLog = (chunk: Buffer | string): void => {
      const text = sanitizeLog(String(chunk))
      logBuffer += text
      if (logBuffer.length > 12000) logBuffer = logBuffer.slice(-8000)
      logStream.write(text)
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) callbacks.onLog({ instanceId: instance.id, line: line.slice(0, 500), at: Date.now() })
      }
    }

    child.stdout?.on('data', pushLog)
    child.stderr?.on('data', pushLog)
    child.on('error', (error) => {
      pushLog(`[launcher] Java 进程错误：${error.message}\n`)
    })

    watcher.on('minecraft-window-ready', () => {
      callbacks.onState({ instanceId: instance.id, status: 'running', message: '游戏已启动' })
    })

    watcher.on('error', (error) => {
      if (entry.stopping) return
      callbacks.onState({
        instanceId: instance.id,
        status: 'error',
        message: `启动失败：${errorMessage(error)}`
      })
    })

    watcher.on('minecraft-exit', (event) => {
      const playtime = Date.now() - entry.startedAt
      runningGames.delete(instance.id)
      logStream.end()
      try {
        store.updateInstance(instance.id, (current) => ({
          ...current,
          lastPlayedAt: Date.now(),
          totalPlayTimeMs: current.totalPlayTimeMs + Math.max(0, playtime)
        }))
      } catch {
        /* instance may have been removed while running */
      }
      if (entry.stopping) {
        callbacks.onState({ instanceId: instance.id, status: 'exited', message: '游戏已结束' })
      } else if (event.code !== 0) {
        const crash = (event.crashReport || logBuffer.slice(-2000) || '').trim()
        callbacks.onState({
          instanceId: instance.id,
          status: 'error',
          code: event.code,
          message: `游戏异常退出（代码 ${event.code}）${crash ? `：${crash.slice(0, 300)}` : ''}`
        })
      } else {
        callbacks.onState({ instanceId: instance.id, status: 'exited', message: '游戏已正常退出' })
      }
      callbacks.onLog({ instanceId: instance.id, line: `[launcher] 游戏进程结束，用时 ${formatDuration(playtime)}`, at: Date.now() })
    })

    return {
      instanceId: instance.id,
      status: 'launching',
      message: '游戏正在启动…'
    }
  } catch (error) {
    logStream.end()
    throw new Error(`启动游戏失败：${errorMessage(error)}`)
  }
}

export function stopGame(instanceId: string): void {
  const running = runningGames.get(instanceId)
  if (!running) return
  running.stopping = true
  try {
    running.process.kill()
  } catch {
    /* ignore */
  }
}

export function runningInstanceIds(): string[] {
  return [...runningGames.keys()]
}

function sanitizeLog(value: string): string {
  return value.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '').replace(/\r\n/g, '\n')
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return '不到 1 分钟'
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours} 小时 ${minutes % 60} 分钟` : `${minutes} 分钟`
}

export function instancePlaytimeLabel(ms: number): string {
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes} 分钟`
  return `${Math.floor(minutes / 60)} 小时`
}

export function validateJavaPath(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

export function countInstanceMods(gamePath: string): number {
  const modsPath = join(gamePath, 'mods')
  if (!existsSync(modsPath)) return 0
  try {
    return readdirSync(modsPath).filter((name) => isModFile(name)).length
  } catch {
    return 0
  }
}

export function isModFile(name: string): boolean {
  return name.endsWith('.jar') || name.endsWith('.jar.disabled')
}

export function instanceSizeBytes(gamePath: string): number {
  let total = 0
  if (!existsSync(gamePath)) return 0
  try {
    for (const entry of readdirSync(gamePath, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      total += statSync(join(gamePath, entry.name)).size
    }
  } catch {
    return total
  }
  return total
}
