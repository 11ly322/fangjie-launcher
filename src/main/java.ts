import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { ResolvedVersion } from '@xmcl/core'
import {
  fetchJavaRuntimeManifest,
  getPotentialJavaLocations,
  installJavaRuntimeTask,
  resolveJava
} from '@xmcl/installer'
import type { Task } from '@xmcl/task'
import type { JavaRuntime, JavaStatus } from '../shared/types'
import type { LauncherStore } from './store'
import type { TaskManager } from './tasks'
import { XMCL_HEADERS, xmclDownloadAgent } from './downloadAgent'

const JAVA_EXE = process.platform === 'win32' ? 'java.exe' : 'java'

export function normalizeJavaPath(candidate: string): string {
  if (!candidate) return ''
  let value = candidate.trim().replace(/^"|"$/g, '')
  if (!value) return ''
  if (existsSync(value) && !value.toLowerCase().endsWith(JAVA_EXE) && !value.toLowerCase().endsWith('javaw.exe')) {
    const nested = join(value, 'bin', JAVA_EXE)
    if (existsSync(nested)) return nested
  }
  return value
}

async function inspectJava(path: string, source: 'auto' | 'manual' | 'system'): Promise<JavaRuntime | undefined> {
  if (!path || !existsSync(path)) return undefined
  try {
    const info = await resolveJava(path)
    if (!info) return undefined
    return {
      path,
      version: info.version,
      majorVersion: info.majorVersion,
      source: source === 'manual' ? 'manual' : 'auto'
    }
  } catch {
    return undefined
  }
}

function javaCandidatesInRuntimeFolder(store: LauncherStore): Array<{ path: string; component: string }> {
  const root = join(store.minecraftPath, 'runtime')
  if (!existsSync(root)) return []
  const result: Array<{ path: string; component: string }> = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const executable = join(root, entry.name, 'bin', JAVA_EXE)
    if (existsSync(executable)) result.push({ path: executable, component: entry.name })
  }
  return result
}

interface JavaCacheEntry {
  mtimeMs: number
  runtime: JavaRuntime
}

interface JavaCacheFile {
  version: 1
  updatedAt: number
  systemAt: number
  system: JavaRuntime[]
  entries: Record<string, JavaCacheEntry>
}

const SYSTEM_CACHE_TTL = 24 * 60 * 60 * 1000
let backgroundRefresh: Promise<JavaStatus> | null = null

function javaCachePath(store: LauncherStore): string {
  return join(store.dataPath, 'cache', 'java-runtimes.json')
}

function emptyJavaCache(): JavaCacheFile {
  return { version: 1, updatedAt: 0, systemAt: 0, system: [], entries: {} }
}

function readJavaCache(store: LauncherStore): JavaCacheFile {
  try {
    const raw = JSON.parse(readFileSync(javaCachePath(store), 'utf8')) as Partial<JavaCacheFile>
    if (!raw || raw.version !== 1 || typeof raw.entries !== 'object' || !raw.entries) {
      return emptyJavaCache()
    }
    const entries: Record<string, JavaCacheEntry> = {}
    for (const [key, value] of Object.entries(raw.entries)) {
      if (
        value &&
        typeof value.mtimeMs === 'number' &&
        value.runtime &&
        typeof value.runtime.path === 'string' &&
        typeof value.runtime.version === 'string' &&
        typeof value.runtime.majorVersion === 'number'
      ) {
        entries[key] = {
          mtimeMs: value.mtimeMs,
          runtime: {
            ...value.runtime,
            source: value.runtime.source === 'manual' ? 'manual' : 'auto'
          }
        }
      }
    }
    return {
      version: 1,
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
      systemAt: typeof raw.systemAt === 'number' ? raw.systemAt : 0,
      system: Array.isArray(raw.system)
        ? raw.system.filter(
            (item): item is JavaRuntime =>
              Boolean(item) &&
              typeof item.path === 'string' &&
              typeof item.version === 'string' &&
              typeof item.majorVersion === 'number'
          )
        : [],
      entries
    }
  } catch {
    return emptyJavaCache()
  }
}

function writeJavaCache(store: LauncherStore, cache: JavaCacheFile): void {
  try {
    const file = javaCachePath(store)
    mkdirSync(dirname(file), { recursive: true })
    const temporary = `${file}.${process.pid}.tmp`
    writeFileSync(temporary, JSON.stringify({ ...cache, updatedAt: Date.now() }), 'utf8')
    renameSync(temporary, file)
  } catch {
    /* Java detection remains usable even when the cache cannot be written */
  }
}

function cachedRuntime(entry: JavaCacheEntry | undefined, path: string): JavaRuntime | undefined {
  if (!entry || !existsSync(path)) return undefined
  try {
    if (Math.abs(statSync(path).mtimeMs - entry.mtimeMs) > 1) return undefined
  } catch {
    return undefined
  }
  return { ...entry.runtime, path }
}

function sortJavaRuntimes(runtimes: JavaRuntime[]): JavaRuntime[] {
  return [...runtimes].sort((left, right) => {
    if (left.source !== right.source) return left.source === 'manual' ? -1 : 1
    return right.majorVersion - left.majorVersion
  })
}

/** Fast, subprocess-free Java status for the first bootstrap paint. */
export function cachedJavaStatus(store: LauncherStore): JavaStatus {
  const cache = readJavaCache(store)
  const runtimes: JavaRuntime[] = []
  const seen = new Set<string>()
  for (const entry of Object.values(cache.entries)) {
    const runtime = cachedRuntime(entry, entry.runtime.path)
    if (!runtime) continue
    const key = runtime.path.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    runtimes.push(runtime)
  }
  for (const runtime of cache.system) {
    if (!existsSync(runtime.path)) continue
    const key = runtime.path.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    runtimes.push(runtime)
  }
  return {
    runtimes: sortJavaRuntimes(runtimes),
    configuredPath: normalizeJavaPath(store.settings.javaPath),
    fromCache: true
  }
}

export function refreshJavaInBackground(
  store: LauncherStore,
  onUpdate: (status: JavaStatus) => void
): void {
  if (backgroundRefresh) return
  backgroundRefresh = scanJavaRuntimes(store)
    .then((status) => {
      onUpdate(status)
      return status
    })
    .catch(() => cachedJavaStatus(store))
    .finally(() => {
      backgroundRefresh = null
    })
}

export async function scanJavaRuntimes(
  store: LauncherStore,
  options: { force?: boolean } = {}
): Promise<JavaStatus> {
  const cache = readJavaCache(store)
  const runtimes: JavaRuntime[] = []
  const seen = new Set<string>()
  const add = (runtime: JavaRuntime | undefined, component?: string): void => {
    if (!runtime) return
    const key = runtime.path.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    runtimes.push({ ...runtime, component })
  }

  const candidates = [
    ...javaCandidatesInRuntimeFolder(store).map((candidate) => ({
      ...candidate,
      source: 'auto' as const
    })),
    ...(normalizeJavaPath(store.settings.javaPath)
      ? [{ path: normalizeJavaPath(store.settings.javaPath), source: 'manual' as const }]
      : [])
  ]

  for (const candidate of candidates) {
    const key = candidate.path.toLowerCase()
    let entry = cache.entries[key]
    let runtime = cachedRuntime(entry, candidate.path)
    if (!runtime) {
      runtime = await inspectJava(candidate.path, candidate.source)
      if (runtime) {
        try {
          entry = { mtimeMs: statSync(candidate.path).mtimeMs, runtime }
          cache.entries[key] = entry
        } catch {
          /* ignore a file that vanished during inspection */
        }
      }
    }
    add(runtime, 'component' in candidate ? candidate.component : undefined)
  }

  const systemCacheFresh =
    cache.systemAt > 0 && Date.now() - cache.systemAt < SYSTEM_CACHE_TTL && !options.force
  if (systemCacheFresh) {
    for (const runtime of cache.system) add(runtime)
  } else {
    try {
      const systemCandidates = await getPotentialJavaLocations()
      const inspected = await Promise.all(
        [...new Set(systemCandidates)].slice(0, 6).map((candidate) => inspectJava(candidate, 'system'))
      )
      cache.system = inspected.filter((runtime): runtime is JavaRuntime => Boolean(runtime))
      cache.systemAt = Date.now()
      for (const runtime of cache.system) add(runtime)
    } catch {
      for (const runtime of cache.system) add(runtime)
    }
  }

  writeJavaCache(store, cache)
  return {
    runtimes: sortJavaRuntimes(runtimes),
    configuredPath: normalizeJavaPath(store.settings.javaPath),
    fromCache: false
  }
}

/** Register a runtime we just installed; its version is known, so no probe is needed. */
export function registerJavaRuntime(
  store: LauncherStore,
  path: string,
  majorVersion: number,
  component?: string
): void {
  if (!existsSync(path)) return
  try {
    const cache = readJavaCache(store)
    cache.entries[path.toLowerCase()] = {
      mtimeMs: statSync(path).mtimeMs,
      runtime: {
        path,
        version: `Java ${majorVersion}`,
        majorVersion,
        source: 'auto',
        component
      }
    }
    writeJavaCache(store, cache)
  } catch {
    /* registration is an optimization, not a correctness requirement */
  }
}

export function requiredJavaMajor(version: ResolvedVersion): number {
  return version.javaVersion?.majorVersion || 17
}

function componentForMajor(major: number): string {
  if (major <= 8) return 'jre-legacy'
  if (major <= 16) return 'java-runtime-alpha'
  if (major === 17) return 'java-runtime-gamma'
  if (major === 21) return 'java-runtime-delta'
  return 'java-runtime-delta'
}

export interface JavaInstallProgress {
  (progress: number, detail: string): void
}

export async function ensureJavaRuntime(options: {
  store: LauncherStore
  version: ResolvedVersion
  taskId: string
  tasks: TaskManager
  onProgress: JavaInstallProgress
}): Promise<string> {
  const { store, version, taskId, tasks, onProgress } = options
  const requiredMajor = requiredJavaMajor(version)

  const configured = normalizeJavaPath(store.settings.javaPath)
  if (configured && existsSync(configured)) {
    const manual = await inspectJava(configured, 'manual')
    if (manual) {
      onProgress(100, `使用手动配置的 Java ${manual.version}`)
      return manual.path
    }
  }

  const automatic = javaCandidatesInRuntimeFolder(store)
    .map((candidate) => ({ ...candidate }))
  for (const candidate of automatic) {
    const runtime = await inspectJava(candidate.path, 'auto')
    if (runtime && (runtime.majorVersion === requiredMajor || candidate.component === version.javaVersion?.component)) {
      onProgress(100, `使用 Java ${runtime.version}`)
      return runtime.path
    }
  }

  const component = version.javaVersion?.component || componentForMajor(requiredMajor)
  const destination = join(store.minecraftPath, 'runtime', component)
  onProgress(2, `正在获取 Java ${requiredMajor} 运行时信息…`)

  const manifest = await fetchJavaRuntimeManifest({
    target: component,
    dispatcher: xmclDownloadAgent.dispatcher,
    headers: XMCL_HEADERS
  })
  const expectedBytes = Object.values(manifest.files).reduce((total, entry) => {
    return entry.type === 'file' ? total + (entry.downloads.raw.size || 0) : total
  }, 0)
  const task = installJavaRuntimeTask({
    manifest,
    destination,
    agent: xmclDownloadAgent,
    headers: XMCL_HEADERS
  })
  tasks.setCancel(taskId, () => task.cancel())
  try {
    await runInstallTask(task, expectedBytes, (percent, detail) => {
      onProgress(2 + percent * 0.98, detail)
    })
  } catch (error) {
    if (tasks.get(taskId)?.status === 'cancelled') throw new CancelledTaskError()
    throw new Error(`Java 运行时下载失败：${errorMessage(error)}`)
  }

  const executable = join(destination, 'bin', JAVA_EXE)
  if (!existsSync(executable)) {
    throw new Error('Java 运行时解压不完整，未找到 java 可执行文件')
  }
  registerJavaRuntime(store, executable, requiredMajor, component)
  onProgress(100, `Java ${requiredMajor} 准备就绪`)
  return executable
}

export async function runInstallTask(
  task: Task<any>,
  expectedBytes: number,
  onProgress: (percent: number, detail: string) => void
): Promise<void> {
  let lastEmit = 0
  let downloadedBytes = 0
  await task.startAndWait({
    onUpdate: (child, chunkSize) => {
      if (Array.isArray((child as unknown as { children?: unknown[] }).children)) return
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
      onProgress(
        percent,
        expectedBytes > 0
          ? `${describeTask(task)} ${formatDownloaded(downloadedBytes, expectedBytes)}`
          : describeTask(task)
      )
    }
  })
  onProgress(100, 'Java 运行时准备完成')
}

function formatDownloaded(downloaded: number, expected: number): string {
  const toMb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(0)} MB`
  return `${toMb(downloaded)} / ${toMb(expected)}`
}

function describeTask(task: Task<any>): string {
  const path = task.path || task.name || ''
  if (path.includes('assets')) return '正在下载游戏资源…'
  if (path.includes('libraries')) return '正在下载运行库…'
  if (path.includes('json')) return '正在读取版本信息…'
  if (path.includes('jar')) return '正在下载游戏核心…'
  if (path.includes('java')) return '正在下载 Java 运行时…'
  return '正在下载必要文件…'
}

export class CancelledTaskError extends Error {
  constructor() {
    super('任务已取消')
    this.name = 'CancelledTaskError'
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message || String(error)
    return message.length > 800 ? `${message.slice(0, 800)}…` : message
  }
  return String(error)
}

export function javaDisplayName(path: string): string {
  return basename(path)
}
