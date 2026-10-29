import { mkdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type {
  InstallModResult,
  InstalledMod,
  Instance,
  ModProject,
  ModSearchHit,
  ModSearchResponse,
  ModVersion,
  ModVersionFile,
  ProjectType
} from '../shared/types'
import type { LauncherStore } from './store'
import { safeFileName } from './store'
import type { TaskManager } from './tasks'
import { errorMessage } from './java'
import { ensureModsDirectory, isJarName, listInstanceMods, saveInstalledMods } from './mods'
import { LOADER_MOD_TAGS } from '../shared/constants'
import { USER_AGENT } from './version'
import { downloadToFile } from './downloadSource'

const DEFAULT_API_BASE = 'https://mod.mcimirror.top/curseforge/v1'
let apiBase = DEFAULT_API_BASE

export function configureCurseForgeBase(value?: string): void {
  apiBase = (value || DEFAULT_API_BASE).replace(/\/+$/, '')
}

const LOADER_IDS: Record<string, number> = {
  forge: 1,
  fabric: 4,
  quilt: 5,
  neoforge: 6
}

const LOADER_NAMES: Record<number, string> = {
  1: 'forge',
  2: 'cauldron',
  3: 'liteloader',
  4: 'fabric',
  5: 'quilt',
  6: 'neoforge'
}

const CATEGORY_IDS: Record<string, number> = {
  optimization: 6814,
  technology: 412,
  magic: 419,
  adventure: 422,
  decoration: 424,
  worldgen: 406,
  library: 421
}

interface CfCategory {
  id: number
  name: string
  slug: string
}

interface CfFile {
  id: number
  displayName: string
  fileName: string
  releaseType: number
  fileDate: string
  fileLength: number
  downloadCount: number
  downloadUrl: string | null
  gameVersions: string[]
  dependencies: Array<{ modId: number; relationType: number }>
  hashes?: Array<{ value: string; algo: number }>
}

interface CfMod {
  id: number
  name: string
  slug: string
  summary: string
  downloadCount: number
  favoriteCount?: number
  dateModified: string
  dateCreated?: string
  logo?: { thumbnailUrl?: string; url?: string }
  categories?: CfCategory[]
  authors?: Array<{ name: string }>
  links?: {
    websiteUrl?: string
    issuesUrl?: string
    sourceUrl?: string
    wikiUrl?: string
  }
  latestFilesIndexes?: Array<{ gameVersion: string; modLoader: number }>
  allowModDistribution?: boolean
}

interface CfSearchResponse {
  data: CfMod[]
  pagination: {
    index: number
    pageSize: number
    resultCount: number
    totalCount: number
  }
}

const projectCache = new Map<number, { at: number; project: CfMod }>()
const fileCache = new Map<string, { at: number; files: CfFile[] }>()

async function cfFetch<T>(path: string, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(30_000)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    try {
      const response = await fetch(`${apiBase}${path}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: combined
      })
      if (response.status === 429 || response.status >= 500) {
        await wait(Math.min(4000, 350 * (attempt + 1)), signal)
        lastError = new Error(
          response.status === 429
            ? 'CurseForge 请求过于频繁，请稍后重试'
            : `CurseForge 服务暂时不可用（${response.status}）`
        )
        continue
      }
      if (!response.ok) {
        if (response.status === 404) throw new Error('没有找到这个 CurseForge 项目')
        throw new Error(`CurseForge 请求失败（${response.status}）`)
      }
      return (await response.json()) as T
    } catch (error) {
      if (signal?.aborted) throw error
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('无法连接 CurseForge 服务')
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
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

function modLoadersFromFile(file: CfFile): string[] {
  return file.gameVersions
    .map((value) => value.toLowerCase())
    .filter((value) => ['fabric', 'quilt', 'forge', 'neoforge', 'liteloader'].includes(value))
}

function modLoadersFromIndexes(mod: CfMod): string[] {
  const set = new Set<string>()
  for (const index of mod.latestFilesIndexes || []) {
    const name = LOADER_NAMES[index.modLoader]
    if (name) set.add(name)
  }
  return [...set]
}

function projectId(mod: CfMod): string {
  return `cf-${mod.id}`
}

function normalizeProject(mod: CfMod): ModProject {
  const categories = mod.categories || []
  const gameVersions = [
    ...new Set((mod.latestFilesIndexes || []).map((item) => item.gameVersion))
  ].slice(0, 30)
  return {
    project_id: projectId(mod),
    slug: mod.slug,
    title: mod.name,
    description: mod.summary || '',
    categories: categories.map((category) => category.slug),
    display_categories: categories.map((category) => category.name),
    client_side: 'optional',
    server_side: 'optional',
    project_type: 'mod',
    downloads: mod.downloadCount || 0,
    follows: mod.favoriteCount || 0,
    icon_url: mod.logo?.thumbnailUrl || mod.logo?.url,
    date_modified: mod.dateModified,
    license: undefined,
    gallery: [],
    versions: gameVersions,
    loaders: modLoadersFromIndexes(mod),
    source: 'curseforge',
    website_url:
      mod.links?.websiteUrl || `https://www.curseforge.com/minecraft/mc-mods/${mod.slug}`,
    author: mod.authors?.[0]?.name,
    body: mod.summary || '',
    issues_url: mod.links?.issuesUrl,
    source_url: mod.links?.sourceUrl,
    wiki_url: mod.links?.wikiUrl,
    discord_url: undefined
  }
}

function normalizeFile(mod: CfMod, file: CfFile): ModVersion {
  const sha1 = file.hashes?.find((hash) => hash.algo === 1)?.value
  const download: ModVersionFile = {
    url: file.downloadUrl || '',
    filename: file.fileName,
    primary: true,
    size: file.fileLength || 0,
    hashes: sha1 ? { sha1 } : {}
  }
  return {
    id: String(file.id),
    project_id: projectId(mod),
    name: file.displayName || file.fileName,
    version_number: file.displayName || file.fileName,
    version_type: file.releaseType === 1 ? 'release' : file.releaseType === 2 ? 'beta' : 'alpha',
    game_versions: file.gameVersions,
    loaders: modLoadersFromFile(file),
    date_published: file.fileDate,
    downloads: file.downloadCount || 0,
    files: [download],
    dependencies: (file.dependencies || [])
      .filter((dependency) => dependency.relationType === 3)
      .map((dependency) => ({
        version_id: null,
        project_id: `cf-${dependency.modId}`,
        file_name: null,
        dependency_type: 'required' as const
      }))
  }
}

export async function searchCurseForge(options: {
  query: string
  instance?: Instance
  category?: string
  offset?: number
  limit?: number
  sort?: 'relevance' | 'downloads' | 'newest' | 'updated'
  projectType?: ProjectType
}): Promise<ModSearchResponse> {
  const params = new URLSearchParams({
    gameId: '432',
    classId: options.projectType === 'resourcepack' ? '12' : options.projectType === 'shader' ? '6552' : '6',
    index: String(Math.max(0, options.offset || 0)),
    pageSize: String(Math.min(48, Math.max(1, options.limit || 20)))
  })
  if (options.query) params.set('searchFilter', options.query)
  if (options.instance?.mcVersion) params.set('gameVersion', options.instance.mcVersion)
  if (!options.projectType || options.projectType === 'mod') {
    if (options.instance && options.instance.loader !== 'vanilla') {
      const loaderId = LOADER_IDS[options.instance.loader]
      if (loaderId) params.set('modLoaderType', String(loaderId))
    }
  }
  if (options.category && CATEGORY_IDS[options.category]) {
    params.set('categoryId', String(CATEGORY_IDS[options.category]))
  }
  const sortField =
    options.sort === 'downloads' ? '6' : options.sort === 'updated' || options.sort === 'newest' ? '3' : '2'
  params.set('sortField', sortField)
  params.set('sortOrder', 'desc')

  const response = await cfFetch<CfSearchResponse>(`/mods/search?${params.toString()}`)
  const filteredLoaders =
    (!options.projectType || options.projectType === 'mod') && options.instance && options.instance.loader !== 'vanilla'
      ? [options.instance.loader]
      : undefined
  const hits: ModSearchHit[] = (response.data || []).map((mod) => {
    const project = normalizeProject(mod)
    return {
      project_id: project.project_id,
      slug: project.slug,
      title: project.title,
      description: project.description,
      categories: project.categories,
      display_categories: project.display_categories,
      client_side: project.client_side,
      server_side: project.server_side,
      project_type: 'mod',
      downloads: project.downloads,
      follows: project.follows,
      icon_url: project.icon_url,
      date_modified: project.date_modified,
      versions: project.versions,
      loaders: filteredLoaders || project.loaders,
      source: 'curseforge',
      website_url: project.website_url,
      author: project.author
    }
  })
  return {
    hits,
    offset: response.pagination?.index || 0,
    limit: response.pagination?.pageSize || Number(params.get('pageSize')) || 20,
    total_hits: response.pagination?.totalCount || 0
  }
}

async function getCfMod(modId: number): Promise<CfMod> {
  const cached = projectCache.get(modId)
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.project
  const response = await cfFetch<{ data: CfMod }>(`/mods/${modId}`)
  projectCache.set(modId, { at: Date.now(), project: response.data })
  return response.data
}

export async function getCurseForgeFile(
  projectId: number,
  fileId: number
): Promise<{ fileName: string; url: string; sha1?: string }> {
  const response = await cfFetch<{ data: CfFile }>('/mods/' + projectId + '/files/' + fileId)
  const file = response.data
  if (!file?.downloadUrl) {
    throw new Error('CurseForge 文件没有公开下载地址')
  }
  return {
    fileName: file.fileName,
    url: file.downloadUrl,
    sha1: file.hashes?.find((hash) => hash.algo === 1)?.value
  }
}

export async function getCurseForgeProject(
  idOrSlug: string,
  instance?: Instance
): Promise<{ project: ModProject; versions: ModVersion[] }> {
  const numeric = Number(idOrSlug.replace(/^cf-/, ''))
  if (!Number.isFinite(numeric)) throw new Error('无效的 CurseForge 项目')
  const mod = await getCfMod(numeric)
  const files = await getCfFiles(mod.id, instance)
  return {
    project: normalizeProject(mod),
    versions: files.map((file) => normalizeFile(mod, file))
  }
}

async function getCfFiles(modId: number, instance?: Instance): Promise<CfFile[]> {
  const key = `${modId}:${instance?.mcVersion || 'any'}:${instance?.loader || 'any'}`
  const cached = fileCache.get(key)
  if (cached && Date.now() - cached.at < 2 * 60 * 1000) return cached.files

  const params = new URLSearchParams({ pageSize: '50' })
  if (instance?.mcVersion) params.set('gameVersion', instance.mcVersion)
  if (instance && instance.loader !== 'vanilla') {
    const loaderId = LOADER_IDS[instance.loader]
    if (loaderId) params.set('modLoaderType', String(loaderId))
  }
  let response = await cfFetch<{ data: CfFile[] }>(
    `/mods/${modId}/files?${params.toString()}`
  )
  let files = response.data || []

  if (!files.length && instance) {
    response = await cfFetch<{ data: CfFile[] }>(`/mods/${modId}/files?pageSize=50`)
    files = (response.data || []).filter((file) => fileMatchesInstance(file, instance))
  }

  files = files
    .filter((file) => file.downloadUrl)
    .sort((left, right) => Date.parse(right.fileDate) - Date.parse(left.fileDate))
  fileCache.set(key, { at: Date.now(), files })
  return files
}

function fileMatchesInstance(file: CfFile, instance: Instance): boolean {
  if (!file.gameVersions.includes(instance.mcVersion)) return false
  const accepted = LOADER_MOD_TAGS[instance.loader] || []
  return modLoadersFromFile(file).some((loader) => accepted.includes(loader))
}

interface CfNode {
  mod: CfMod
  file: CfFile
}

async function resolveCfTree(options: {
  modId: number
  instance: Instance
  installed: Set<string>
  visited: Set<number>
  depth: number
}): Promise<CfNode[]> {
  const { modId, instance, installed, visited, depth } = options
  if (depth > 4) throw new Error('模组依赖层级过深，请手动检查依赖关系')
  if (visited.has(modId)) return []
  visited.add(modId)

  const mod = await getCfMod(modId)
  if (installed.has(projectId(mod))) return []
  const files = await getCfFiles(modId, instance)
  const file = files.find((item) => fileMatchesInstance(item, instance))
  if (!file) {
    throw new Error(`「${mod.name}」没有兼容 ${instance.loader} / ${instance.mcVersion} 的文件`)
  }
  if (!file.downloadUrl) {
    throw new Error(`「${mod.name}」的作者未开放第三方下载，请前往 CurseForge 手动下载`)
  }

  const nodes: CfNode[] = []
  for (const dependency of file.dependencies || []) {
    if (dependency.relationType !== 3) continue
    if (visited.has(dependency.modId)) continue
    if (installed.has(`cf-${dependency.modId}`)) continue
    const nested = await resolveCfTree({
      modId: dependency.modId,
      instance,
      installed,
      visited,
      depth: depth + 1
    })
    nodes.push(...nested)
  }
  nodes.push({ mod, file })
  return nodes
}

export async function startCurseForgeInstall(options: {
  store: LauncherStore
  tasks: TaskManager
  instanceId: string
  projectId: string
  onChange: (reason: string) => void
}): Promise<InstallModResult> {
  const { store, tasks, instanceId, projectId, onChange } = options
  const instance = store.getInstance(instanceId)
  if (!instance) throw new Error('找不到目标实例')
  if (instance.loader === 'vanilla') throw new Error('原版实例不能安装模组')
  const cfId = Number(projectId.replace(/^cf-/, ''))
  if (!Number.isFinite(cfId)) throw new Error('无效的 CurseForge 项目')

  const running = tasks
    .list()
    .some(
      (task) =>
        task.kind === 'mod' &&
        task.status === 'running' &&
        task.instanceId === instanceId &&
        task.projectId === projectId
    )
  if (running) throw new Error('这个模组正在安装中')

  const taskId = tasks.create({
    kind: 'mod',
    title: '解析 CurseForge 模组…',
    subtitle: `${instance.name} · ${instance.loader} ${instance.mcVersion}`,
    detail: '正在读取项目信息…',
    instanceId,
    projectId
  })
  tasks.start(taskId, '正在读取项目信息…')

  void installCfInBackground({ store, tasks, taskId, instance, cfId, onChange }).catch(
    (error) => {
      const task = tasks.get(taskId)
      if (task?.status === 'cancelled') return
      tasks.fail(taskId, errorMessage(error))
      onChange('task')
    }
  )

  return { taskId }
}

async function installCfInBackground(options: {
  store: LauncherStore
  tasks: TaskManager
  taskId: string
  instance: Instance
  cfId: number
  onChange: (reason: string) => void
}): Promise<void> {
  const { store, tasks, taskId, instance, cfId, onChange } = options
  const controller = new AbortController()
  tasks.setCancel(taskId, () => controller.abort())

  const root = await getCfMod(cfId)
  tasks.update(
    taskId,
    {
      title: `安装「${root.name}」`,
      subtitle: `${instance.name} · CurseForge`,
      detail: '正在解析版本与前置…',
      progress: 4
    },
    { immediate: true }
  )

  const installedMods = listInstanceMods(store, instance).filter(
    (mod) => !mod.projectId.startsWith('local:')
  )
  const installed = new Set(installedMods.map((mod) => mod.projectId))
  const nodes = await resolveCfTree({
    modId: cfId,
    instance,
    installed,
    visited: new Set(),
    depth: 0
  })
  if (!nodes.length) throw new Error('这个模组已经安装，无需重复下载')

  const totalBytes = nodes.reduce((sum, node) => sum + (node.file.fileLength || 0), 0)
  const directory = ensureModsDirectory(store, instance)
  let downloadedBytes = 0
  let lastSpeedAt = Date.now()
  let lastSpeedBytes = 0
  let speed = 0
  let updatedMods = [...instance.mods]

  for (let index = 0; index < nodes.length; index += 1) {
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
    const node = nodes[index]
    if (!node.file.downloadUrl) throw new Error(`「${node.mod.name}」没有可用的下载地址`)
    const fileName = safeFileName(node.file.fileName)
    if (!isJarName(fileName)) throw new Error(`「${node.mod.name}」的文件不是有效的 jar`)
    const destination = join(directory, fileName)
    const previousIndex = updatedMods.findIndex((mod) => mod.projectId === projectId(node.mod))

    tasks.update(
      taskId,
      {
        progress: 8 + (downloadedBytes / Math.max(totalBytes, 1)) * 82,
        detail:
          nodes.length > 1
            ? `正在下载 ${node.mod.name}（${index + 1}/${nodes.length}）`
            : `正在下载 ${node.mod.name}`
      },
      { immediate: true }
    )

    await downloadCfFile({
      url: node.file.downloadUrl,
      destination,
      expectedSha1: node.file.hashes?.find((hash) => hash.algo === 1)?.value,
      signal: controller.signal,
      onChunk: (bytes) => {
        downloadedBytes += bytes
        const now = Date.now()
        if (now - lastSpeedAt > 500) {
          speed = ((downloadedBytes - lastSpeedBytes) / (now - lastSpeedAt)) * 1000
          lastSpeedAt = now
          lastSpeedBytes = downloadedBytes
        }
        tasks.update(taskId, {
          progress: 8 + (downloadedBytes / Math.max(totalBytes, 1)) * 82,
          detail: `正在下载 ${node.mod.name} · ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`,
          bytesPerSecond: speed
        })
      }
    })

    if (previousIndex >= 0) {
      const previous = updatedMods[previousIndex]
      if (previous.fileName !== fileName) {
        for (const candidate of [previous.fileName, `${previous.fileName}.disabled`]) {
          rmSync(join(directory, safeFileName(candidate)), { force: true })
        }
      }
      updatedMods.splice(previousIndex, 1)
    }

    const project = normalizeProject(node.mod)
    const record: InstalledMod = {
      projectId: project.project_id,
      slug: project.slug,
      title: project.title,
      versionId: String(node.file.id),
      versionName: node.file.displayName || node.file.fileName,
      fileName,
      iconUrl: project.icon_url || undefined,
      enabled: true,
      installedAt: Date.now(),
      dependencies: (node.file.dependencies || [])
        .filter((dependency) => dependency.relationType === 3)
        .map((dependency) => `cf-${dependency.modId}`)
    }
    updatedMods.push(record)
    saveInstalledMods(store, instance.id, updatedMods)
    onChange('mods')
  }

  tasks.finish(
    taskId,
    nodes.length > 1
      ? `${nodes[nodes.length - 1].mod.name} 与 ${nodes.length - 1} 个前置已安装`
      : `${nodes[0].mod.name} 已安装`,
    100
  )
  onChange('mods')
  onChange('task')
}

async function downloadCfFile(options: {
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
