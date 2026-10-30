import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type {
  InstallModResult,
  InstalledMod,
  Instance,
  ModProject,
  ModSearchHit,
  ModSearchResponse,
  ModVersion,
  ProjectType
} from '../shared/types'
import type { LauncherStore } from './store'
import { safeFileName } from './store'
import type { TaskManager } from './tasks'
import { errorMessage } from './java'
import { ensureModsDirectory, isJarName, listInstanceMods, saveInstalledMods } from './mods'
import { LOADER_MOD_TAGS, MODDED_LOADERS } from '../shared/constants'
import { USER_AGENT } from './version'
import { downloadToFile, requestResponse } from './downloadSource'

const DEFAULT_API_BASE = 'https://api.modrinth.com/v2'
let apiBase = DEFAULT_API_BASE

export function configureModrinthBase(value?: string): void {
  apiBase = (value || DEFAULT_API_BASE).replace(/\/+$/, '')
}

interface ApiSearchHit extends Partial<ModSearchHit> {
  id?: string
  project_id?: string
  slug?: string
  title?: string
  description?: string
  categories?: string[]
  display_categories?: string[]
  downloads?: number
  follows?: number
  icon_url?: string | null
  date_modified?: string
}

interface ApiProject extends Omit<ApiSearchHit, 'gallery'> {
  body?: string
  issues_url?: string | null
  source_url?: string | null
  wiki_url?: string | null
  discord_url?: string | null
  project_type?: string
  client_side?: string
  server_side?: string
  gallery?: Array<{ url?: string }> | string[]
  versions?: string[]
  loaders?: string[]
  game_versions?: string[]
}

interface ApiVersion extends Partial<ModVersion> {
  id: string
  project_id: string
  name: string
  version_number: string
  version_type: string
  game_versions: string[]
  loaders: string[]
  date_published: string
  downloads: number
  files: Array<{
    url: string
    filename: string
    primary: boolean
    size: number
    hashes: { sha1?: string; sha512?: string }
  }>
  dependencies: Array<{
    version_id: string | null
    project_id: string | null
    file_name: string | null
    dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded'
  }>
}

interface InstallNode {
  project: ModProject
  version: ModVersion
}

const projectCache = new Map<string, { at: number; project: ModProject }>()
const versionCache = new Map<string, { at: number; versions: ModVersion[] }>()

async function modrinthFetch<T>(path: string, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(30_000)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    try {
      const response = await requestResponse(`${apiBase}${path}`, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json'
        },
        signal: combined
      })
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get('retry-after') || 0)
        await delay(Math.min(4000, Math.max(300, retryAfter * 1000, 350 * (attempt + 1))), signal)
        lastError = new Error(
          response.status === 429
            ? 'Modrinth 请求过于频繁，请稍后重试'
            : `Modrinth 服务暂时不可用（${response.status}）`
        )
        continue
      }
      if (!response.ok) {
        if (response.status === 404) throw new Error('没有找到这个 Modrinth 项目')
        throw new Error(`Modrinth 请求失败（${response.status}）`)
      }
      return (await response.json()) as T
    } catch (error) {
      if (signal?.aborted) throw error
      if (error instanceof Error && error.name === 'TimeoutError') {
        lastError = new Error('连接 Modrinth 超时，请检查网络后重试')
      } else if (error instanceof Error && error.message.includes('Modrinth')) {
        lastError = error
      } else {
        lastError = error
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('无法连接 Modrinth')
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true }
    )
  })
}

function normalizeHit(raw: ApiSearchHit): ModSearchHit {
  return {
    project_id: raw.project_id || raw.id || '',
    slug: raw.slug || '',
    title: raw.title || '未命名模组',
    description: raw.description || '',
    categories: raw.categories || [],
    display_categories: raw.display_categories || raw.categories || [],
    client_side: (raw as ApiProject).client_side || 'required',
    server_side: (raw as ApiProject).server_side || 'optional',
    project_type: raw.project_type || 'mod',
    downloads: raw.downloads || 0,
    follows: raw.follows || 0,
    icon_url: raw.icon_url || undefined,
    date_modified: raw.date_modified || new Date().toISOString(),
    latest_version: raw.latest_version,
    license: raw.license,
    gallery: raw.gallery,
    versions: raw.versions,
    loaders: raw.loaders
  }
}

function normalizeProject(raw: ApiProject): ModProject {
  const hit = normalizeHit(raw as ApiSearchHit)
  return {
    ...hit,
    body: raw.body || '',
    issues_url: raw.issues_url,
    source_url: raw.source_url,
    wiki_url: raw.wiki_url,
    discord_url: raw.discord_url,
    gallery: (raw.gallery || [])
      .map((item) => (typeof item === 'string' ? item : item.url))
      .filter((url): url is string => Boolean(url))
  }
}

function normalizeVersion(raw: ApiVersion): ModVersion {
  return {
    id: raw.id,
    project_id: raw.project_id,
    name: raw.name || raw.version_number,
    version_number: raw.version_number,
    version_type: raw.version_type,
    game_versions: raw.game_versions || [],
    loaders: raw.loaders || [],
    date_published: raw.date_published,
    downloads: raw.downloads || 0,
    files: (raw.files || []).map((file) => ({
      url: file.url,
      filename: file.filename,
      primary: Boolean(file.primary),
      size: file.size || 0,
      hashes: file.hashes || {}
    })),
    dependencies: (raw.dependencies || []).map((dependency) => ({
      version_id: dependency.version_id,
      project_id: dependency.project_id,
      file_name: dependency.file_name,
      dependency_type: dependency.dependency_type
    }))
  }
}

export async function searchMods(options: {
  query: string
  instance?: Instance
  category?: string
  offset?: number
  limit?: number
  sort?: 'relevance' | 'downloads' | 'newest' | 'updated'
  projectType?: ProjectType
}): Promise<ModSearchResponse> {
  const limit = Math.min(48, Math.max(1, options.limit || 20))
  const offset = Math.max(0, options.offset || 0)
  const kind = options.projectType || 'mod'
  const facets: string[][] = [[`project_type:${kind === 'resourcepack' ? 'resourcepack' : kind === 'shader' ? 'shader' : 'mod'}`]]
  if (kind === 'mod' && options.instance && options.instance.loader !== 'vanilla') {
    facets.push(loadersFor(options.instance).map((loader) => `categories:${loader}`))
  }
  if (options.instance?.mcVersion) facets.push([`versions:${options.instance.mcVersion}`])
  if (options.category) facets.push([`categories:${options.category}`])

  const params = new URLSearchParams({
    query: options.query || '',
    limit: String(limit),
    offset: String(offset),
    index: options.sort || 'relevance',
    facets: JSON.stringify(facets)
  })
  const response = await modrinthFetch<{
    hits: ApiSearchHit[]
    offset: number
    limit: number
    total_hits: number
  }>(`/search?${params.toString()}`)

  return {
    hits: (response.hits || []).map(normalizeHit),
    offset: response.offset || offset,
    limit: response.limit || limit,
    total_hits: response.total_hits || 0
  }
}

export async function getModProject(
  idOrSlug: string,
  instance?: Instance,
  projectType: ProjectType = 'mod'
): Promise<{ project: ModProject; versions: ModVersion[] }> {
  const effective = projectType === 'mod' ? instance : instance ? { ...instance, loader: 'vanilla' as const } : undefined
  const projectPath = `/project/${encodeURIComponent(idOrSlug)}`
  const raw = await modrinthFetch<ApiProject>(projectPath)
  const project = normalizeProject(raw)
  const versions = await getVersionsForProject(project.project_id || idOrSlug, effective)
  return { project, versions }
}

async function getVersionsForProject(projectId: string, instance?: Instance): Promise<ModVersion[]> {
  const params = new URLSearchParams()
  if (instance && instance.loader !== 'vanilla') {
    params.set('loaders', JSON.stringify(loadersFor(instance)))
  }
  if (instance?.mcVersion) params.set('game_versions', JSON.stringify([instance.mcVersion]))
  const query = params.toString()
  const key = `${projectId}:${instance?.loader || 'any'}:${instance?.mcVersion || 'any'}`
  const cached = versionCache.get(key)
  if (cached && Date.now() - cached.at < 2 * 60 * 1000) return cached.versions
  const response = await modrinthFetch<ApiVersion[]>(
    `/project/${encodeURIComponent(projectId)}/version${query ? `?${query}` : ''}`
  )
  const versions = response
    .map(normalizeVersion)
    .filter((version) => version.files.length > 0)
    .sort((left, right) => Date.parse(right.date_published) - Date.parse(left.date_published))
  versionCache.set(key, { at: Date.now(), versions })
  return versions
}

async function getProjectById(projectId: string): Promise<ModProject> {
  const cached = projectCache.get(projectId)
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.project
  const raw = await modrinthFetch<ApiProject>(`/project/${encodeURIComponent(projectId)}`)
  const project = normalizeProject(raw)
  projectCache.set(projectId, { at: Date.now(), project })
  return project
}

async function getVersionById(versionId: string): Promise<ModVersion> {
  const raw = await modrinthFetch<ApiVersion>(`/version/${encodeURIComponent(versionId)}`)
  return normalizeVersion(raw)
}

function pickPrimaryFile(version: ModVersion) {
  return version.files.find((file) => file.primary) || version.files[0]
}

function loadersFor(instance: Instance): string[] {
  return LOADER_MOD_TAGS[instance.loader] || []
}

function isLoaderCompatible(loaders: string[], instance: Instance): boolean {
  const accepted = loadersFor(instance).map((loader) => loader.toLowerCase())
  return loaders.some((loader) => accepted.includes(loader.toLowerCase()))
}

async function resolveInstallTree(options: {
  projectId: string
  instance: Instance
  installedProjectIds: Set<string>
  visited: Set<string>
  depth: number
  selectedVersionId?: string
}): Promise<InstallNode[]> {
  const { projectId, instance, installedProjectIds, visited, depth, selectedVersionId } = options
  if (depth > 4) throw new Error('模组依赖层级过深，请手动检查依赖关系')
  if (visited.has(projectId)) return []
  visited.add(projectId)

  const project = await getProjectById(projectId)
  if (installedProjectIds.has(project.project_id)) return []

  const versions = await getVersionsForProject(project.project_id, instance)
  if (!versions.length) {
    throw new Error(
      `「${project.title}」没有兼容 Minecraft ${instance.mcVersion}（${instance.loader}）的版本`
    )
  }
  const chosen = selectedVersionId
    ? versions.find((version) => version.id === selectedVersionId)
    : versions.find((version) => version.version_type === 'release') || versions[0]
  if (!chosen) throw new Error('所选版本不兼容当前实例，请重新选择版本')
  if (!pickPrimaryFile(chosen)) throw new Error(`「${project.title}」没有可下载的文件`)

  const nodes: InstallNode[] = []
  for (const dependency of chosen.dependencies) {
    if (dependency.dependency_type !== 'required') continue
    if (!dependency.project_id) continue
    if (installedProjectIds.has(dependency.project_id)) continue
    if (visited.has(dependency.project_id)) continue

    if (dependency.version_id) {
      const pinned = await getVersionById(dependency.version_id)
      const dependencyProject = await getProjectById(dependency.project_id)
      if (!pickPrimaryFile(pinned)) continue
      if (!pinned.game_versions.includes(instance.mcVersion) || !isLoaderCompatible(pinned.loaders, instance)) {
        throw new Error(
          `依赖「${dependencyProject.title}」的指定版本不兼容当前实例，请检查模组页面`
        )
      }
      const nested = await resolveInstallTree({
        projectId: dependency.project_id,
        instance,
        installedProjectIds,
        visited,
        depth: depth + 1
      })
      nodes.push(...nested.filter((node) => node.project.project_id !== dependency.project_id))
      nodes.push({ project: dependencyProject, version: pinned })
    } else {
      const nested = await resolveInstallTree({
        projectId: dependency.project_id,
        instance,
        installedProjectIds,
        visited,
        depth: depth + 1
      })
      nodes.push(...nested)
    }
  }

  nodes.push({ project, version: chosen })
  return nodes
}

export async function startModInstall(options: {
  store: LauncherStore
  tasks: TaskManager
  instanceId: string
  projectId: string
  versionId?: string
  onChange: (reason: string) => void
}): Promise<InstallModResult> {
  const { store, tasks, instanceId, projectId, versionId, onChange } = options
  const instance = store.getInstance(instanceId)
  if (!instance) throw new Error('找不到目标实例')
  if (!MODDED_LOADERS.includes(instance.loader as (typeof MODDED_LOADERS)[number])) {
    throw new Error('原版实例不能安装模组，请先创建带模组加载器的实例')
  }

  const alreadyRunning = tasks
    .list()
    .some(
      (task) =>
        task.kind === 'mod' &&
        task.status === 'running' &&
        task.instanceId === instanceId &&
        task.projectId === projectId
    )
  if (alreadyRunning) throw new Error('这个模组正在安装中')

  const taskId = tasks.create({
    kind: 'mod',
    title: '解析模组…',
    subtitle: `${instance.name} · ${instance.mcVersion}`,
    detail: '正在读取 Modrinth 项目信息…',
    instanceId,
    projectId
  })
  tasks.start(taskId, '正在读取 Modrinth 项目信息…')

  void installModInBackground({
    store,
    tasks,
    taskId,
    instance,
    projectId,
    versionId,
    onChange
  }).catch((error) => {
    const task = tasks.get(taskId)
    if (task?.status === 'cancelled') return
    tasks.fail(taskId, errorMessage(error))
    onChange('task')
  })

  return { taskId }
}

async function installModInBackground(options: {
  store: LauncherStore
  tasks: TaskManager
  taskId: string
  instance: Instance
  projectId: string
  versionId?: string
  onChange: (reason: string) => void
}): Promise<void> {
  const { store, tasks, taskId, instance, projectId, versionId, onChange } = options
  const controller = new AbortController()
  tasks.setCancel(taskId, () => controller.abort())

  const project = await getProjectById(projectId)
  tasks.update(
    taskId,
    {
      title: `安装「${project.title}」`,
      subtitle: `${instance.name} · ${instance.loader} ${instance.mcVersion}`,
      detail: '正在解析版本与依赖…',
      progress: 4
    },
    { immediate: true }
  )

  const installed = listInstanceMods(store, instance).filter((mod) => !mod.projectId.startsWith('local:'))
  const installedProjectIds = new Set(installed.map((mod) => mod.projectId))
  const nodes = await resolveInstallTree({
    projectId: project.project_id,
    instance,
    installedProjectIds,
    visited: new Set(),
    depth: 0,
    selectedVersionId: versionId
  })
  if (!nodes.length) throw new Error('这个模组已经安装，无需重复下载')

  const files = nodes.map((node) => {
    const file = pickPrimaryFile(node.version)
    if (!file) throw new Error(`「${node.project.title}」的版本缺少文件`)
    return { node, file }
  })
  const totalBytes = files.reduce((sum, item) => sum + item.file.size, 0)

  const directory = ensureModsDirectory(store, instance)
  const previousMods = [...instance.mods]
  const updatedMods = [...instance.mods]
  let downloadedBytes = 0
  let lastSpeedAt = Date.now()
  let lastSpeedBytes = 0
  let speed = 0

  for (let index = 0; index < files.length; index += 1) {
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
    const { node, file } = files[index]
    const fileName = safeFileName(file.filename)
    if (!isJarName(fileName)) throw new Error(`「${node.project.title}」下载的文件不是有效的 jar 文件`)
    const destination = join(directory, fileName)
    const existingIndex = updatedMods.findIndex((mod) => mod.projectId === node.project.project_id)

    tasks.update(
      taskId,
      {
        progress: 8 + (downloadedBytes / Math.max(totalBytes, 1)) * 82,
        detail:
          files.length > 1
            ? `正在下载 ${node.project.title}（${index + 1}/${files.length}）`
            : `正在下载 ${node.project.title}`
      },
      { immediate: true }
    )

    await downloadFile({
      url: file.url,
      destination,
      expectedSha1: file.hashes.sha1,
      signal: controller.signal,
      onChunk: (bytes) => {
        downloadedBytes += bytes
        const now = Date.now()
        if (now - lastSpeedAt > 500) {
          speed = ((downloadedBytes - lastSpeedBytes) / (now - lastSpeedAt)) * 1000
          lastSpeedAt = now
          lastSpeedBytes = downloadedBytes
        }
        const ratio = downloadedBytes / Math.max(totalBytes, 1)
        tasks.update(taskId, {
          progress: 8 + ratio * 82,
          detail: `正在下载 ${node.project.title} · ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`,
          bytesPerSecond: speed
        })
      }
    })

    if (existingIndex >= 0) {
      const previous = updatedMods[existingIndex]
      if (previous.fileName && previous.fileName !== fileName) {
        removeOldModFile(directory, previous.fileName)
      }
      updatedMods.splice(existingIndex, 1)
    }

    const record: InstalledMod = {
      projectId: node.project.project_id,
      slug: node.project.slug,
      title: node.project.title,
      versionId: node.version.id,
      versionName: node.version.name || node.version.version_number,
      fileName,
      iconUrl: node.project.icon_url || undefined,
      enabled: true,
      installedAt: Date.now(),
      dependencies: node.version.dependencies
        .filter((dependency) => dependency.dependency_type === 'required' && dependency.project_id)
        .map((dependency) => dependency.project_id as string)
    }
    updatedMods.push(record)
    saveInstalledMods(store, instance.id, updatedMods)
    onChange('mods')
  }

  // Remove stale records for the same projects that were replaced.
  const validFiles = new Set(updatedMods.map((mod) => mod.fileName))
  const cleaned = updatedMods.filter((mod) => {
    if (mod.projectId.startsWith('local:')) return true
    return validFiles.has(mod.fileName)
  })
  if (previousMods.length !== cleaned.length) saveInstalledMods(store, instance.id, cleaned)

  const main = files[files.length - 1]
  tasks.finish(
    taskId,
    files.length > 1
      ? `${main.node.project.title} 与 ${files.length - 1} 个前置已安装`
      : `${main.node.project.title} 已安装`,
    100
  )
  onChange('mods')
  onChange('task')
}

function removeOldModFile(directory: string, fileName: string): void {
  const safe = safeFileName(fileName)
  for (const candidate of [safe, `${safe}.disabled`]) {
    try {
      rmSync(join(directory, candidate), { force: true })
    } catch {
      /* the new jar is already in place */
    }
  }
}

export async function downloadFile(options: {
  url: string
  destination: string
  expectedSha1?: string
  signal: AbortSignal
  onChunk: (bytes: number) => void
}): Promise<void> {
  await downloadToFile({
    url: options.url,
    destination: options.destination,
    expectedSha1: options.expectedSha1,
    signal: options.signal,
    headers: { 'User-Agent': USER_AGENT },
    onChunk: options.onChunk
  })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export async function listInstalledMods(
  store: LauncherStore,
  instanceId: string
): Promise<InstalledMod[]> {
  const instance = store.getInstance(instanceId)
  if (!instance) throw new Error('找不到实例')
  return listInstanceMods(store, instance)
}

export function resetModrinthCache(): void {
  projectCache.clear()
  versionCache.clear()
}
