import {
  createHash
} from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import { LibraryInfo, Version } from '@xmcl/core'
import { filterEntries, open, readEntry } from '@xmcl/unzip'
import {
  installForgeTask,
  installLibraries,
  installNeoForgedTask
} from '@xmcl/installer'
import type { LoaderAvailability, LoaderType } from '../shared/types'
import { XMCL_HEADERS, xmclDownloadAgent } from './downloadAgent'
import { USER_AGENT } from './version'
import { requestResponse } from './downloadSource'
import { isOffline } from './networkPolicy'

export const BMCL_API = 'https://bmclapi2.bangbang93.com'
export const BMCL_MAVEN = `${BMCL_API}/maven/`

export interface LoaderInstallResult {
  versionId: string
  loaderVersion: string
}

interface LoaderInstallOptions {
  mcPath: string
  mcVersion: string
  loader: Exclude<LoaderType, 'vanilla'>
  javaPath?: string
  onDetail: (detail: string, progress?: number) => void
  onTask?: (cancel: () => void) => void
}

export async function installModLoader(options: LoaderInstallOptions): Promise<LoaderInstallResult> {
  if (options.loader === 'fabric') return installFabric(options)
  if (options.loader === 'quilt') return installQuilt(options)
  if (options.loader === 'forge') return installForge(options)
  return installNeoForge(options)
}

type ModdedLoader = Exclude<LoaderType, 'vanilla'>

interface AvailabilityCacheEntry {
  at: number
  value: LoaderAvailability[]
}

const AVAILABILITY_TTL = 10 * 60 * 1000
const availabilityCache = new Map<string, AvailabilityCacheEntry>()
const MODDED_LOADERS: ModdedLoader[] = ['fabric', 'quilt', 'forge', 'neoforge']

async function latestFabric(mcVersion: string): Promise<string | undefined> {
  const list = await fetchJson<Array<{ loader?: { version?: string; stable?: boolean } }>>(
    `${BMCL_API}/fabric-meta/v2/versions/loader/${encodeURIComponent(mcVersion)}`
  )
  if (!Array.isArray(list)) return undefined
  const rows = list.filter((item) => typeof item.loader?.version === 'string')
  const chosen = rows.find((item) => item.loader?.stable) || rows[0]
  return chosen?.loader?.version
}

async function latestQuilt(mcVersion: string): Promise<string | undefined> {
  const list = await fetchJson<Array<{ loader?: { version?: string } }>>(
    `https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mcVersion)}`
  )
  if (!Array.isArray(list)) return undefined
  const versions = list
    .map((item) => item.loader?.version)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
  const stable = versions.filter((value) => !value.includes('-')).sort((left, right) => compareVersion(right, left))
  return (stable.length ? stable : versions.sort((left, right) => compareVersion(right, left)))[0]
}

async function latestForge(mcVersion: string): Promise<string | undefined> {
  const list = await fetchJson<Array<{ version?: string }>>(
    `${BMCL_API}/forge/minecraft/${encodeURIComponent(mcVersion)}`
  )
  if (!Array.isArray(list)) return undefined
  return list
    .map((item) => item.version)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .sort((left, right) => compareVersion(right, left))[0]
}

async function latestNeoForge(mcVersion: string): Promise<string | undefined> {
  const list = await fetchJson<Array<{ version?: string }>>(
    `${BMCL_API}/neoforge/list/${encodeURIComponent(mcVersion)}`
  )
  if (!Array.isArray(list)) return undefined
  const versions = list
    .map((item) => item.version)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
  const stable = versions.filter((value) => !/alpha|beta/i.test(value))
  return (stable.length ? stable : versions).sort((left, right) => compareVersion(right, left))[0]
}

const LATEST_LOOKUP: Record<ModdedLoader, (mcVersion: string) => Promise<string | undefined>> = {
  fabric: latestFabric,
  quilt: latestQuilt,
  forge: latestForge,
  neoforge: latestNeoForge
}

export async function getLoaderAvailability(mcVersion: string): Promise<LoaderAvailability[]> {
  const version = typeof mcVersion === 'string' ? mcVersion.trim() : ''
  if (!version) return MODDED_LOADERS.map((loader) => ({ loader, available: false, error: '请先选择游戏版本' }))
  if (isOffline()) {
    return MODDED_LOADERS.map((loader) => ({ loader, available: false, error: '离线模式已开启' }))
  }
  const cached = availabilityCache.get(version)
  if (cached && Date.now() - cached.at < AVAILABILITY_TTL) return cached.value

  const value = await Promise.all(
    MODDED_LOADERS.map(async (loader): Promise<LoaderAvailability> => {
      try {
        const latest = await LATEST_LOOKUP[loader](version)
        return latest
          ? { loader, available: true, latest }
          : { loader, available: false, error: `Minecraft ${version} 暂无 ${loaderDisplayName(loader)} 版本` }
      } catch (error) {
        return {
          loader,
          available: false,
          error: `无法获取 ${loaderDisplayName(loader)} 版本：${error instanceof Error ? error.message : String(error)}`
        }
      }
    })
  )
  availabilityCache.set(version, { at: Date.now(), value })
  return value
}

async function installFabric(options: LoaderInstallOptions): Promise<LoaderInstallResult> {
  options.onDetail('正在获取 Fabric 加载器版本…', 10)
  const loaders = await fetchJson<
    Array<{ loader: { version: string; stable: boolean; build?: number } }>
  >(`${BMCL_API}/fabric-meta/v2/versions/loader/${encodeURIComponent(options.mcVersion)}`)
  if (!Array.isArray(loaders) || !loaders.length) {
    throw new Error(`Minecraft ${options.mcVersion} 暂时没有 Fabric 版本`)
  }
  const chosen = loaders.find((item) => item.loader.stable) || loaders[0]
  options.onDetail(`正在生成 Fabric ${chosen.loader.version} 启动配置…`, 30)
  const profile = await fetchJson<FabricProfile>(
    `${BMCL_API}/fabric-meta/v2/versions/loader/${encodeURIComponent(options.mcVersion)}/${encodeURIComponent(
      chosen.loader.version
    )}/profile/json`
  )
  if (Array.isArray(profile.libraries)) {
    for (const library of profile.libraries) {
      if (typeof library.url === 'string' && library.url.includes('maven.fabricmc.net')) {
        library.url = BMCL_MAVEN
      }
    }
  }
  const versionId = writeLoaderProfile(options.mcPath, profile)
  options.onDetail('正在补齐 Fabric 运行库…', 55)
  const resolved = await Version.parse(options.mcPath, versionId)
  await installLibraries(resolved, {
    mavenHost: [BMCL_MAVEN],
    agent: xmclDownloadAgent,
    headers: XMCL_HEADERS
  })
  options.onDetail('Fabric 加载器安装完成', 100)
  return { versionId, loaderVersion: chosen.loader.version }
}

async function installQuilt(options: LoaderInstallOptions): Promise<LoaderInstallResult> {
  options.onDetail('正在获取 Quilt 加载器版本…', 10)
  const loaders = await fetchJson<
    Array<{ loader: { version: string; build?: number } }>
  >(`https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(options.mcVersion)}`)
  if (!Array.isArray(loaders) || !loaders.length) {
    throw new Error(`Minecraft ${options.mcVersion} 暂时没有 Quilt 版本`)
  }
  const stable = loaders
    .filter((item) => !item.loader.version.includes('-'))
    .sort((left, right) => compareVersion(right.loader.version, left.loader.version))[0]
  const chosen = stable || loaders[0]
  options.onDetail(`正在生成 Quilt ${chosen.loader.version} 启动配置…`, 30)
  const profile = await fetchJson<QuiltProfile>(
    `https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(options.mcVersion)}/${encodeURIComponent(
      chosen.loader.version
    )}/profile/json`
  )
  const versionId = writeLoaderProfile(options.mcPath, {
    ...profile,
    id: profile.id || `quilt-loader-${chosen.loader.version}-${options.mcVersion}`
  })
  options.onDetail('正在补齐 Quilt 运行库…', 55)
  const resolved = await Version.parse(options.mcPath, versionId)
  await installLibraries(resolved, {
    mavenHost: [BMCL_MAVEN],
    agent: xmclDownloadAgent,
    headers: XMCL_HEADERS
  })
  options.onDetail('Quilt 加载器安装完成', 100)
  return { versionId, loaderVersion: chosen.loader.version }
}

async function installForge(options: LoaderInstallOptions): Promise<LoaderInstallResult> {
  if (!options.javaPath) throw new Error('安装 Forge 需要 Java 运行时')
  options.onDetail('正在获取 Forge 版本列表…', 5)
  const list = await fetchJson<Array<{ version: string }>>(
    `${BMCL_API}/forge/minecraft/${encodeURIComponent(options.mcVersion)}`
  )
  if (!Array.isArray(list) || !list.length) {
    throw new Error(`Minecraft ${options.mcVersion} 暂时没有 Forge 版本`)
  }
  const versions = list
    .map((item) => item.version)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .sort((left, right) => compareVersion(right, left))
  const forgeVersion = versions[0]
  if (!forgeVersion) throw new Error('Forge 版本列表为空')

  const forgeArtifact = `${options.mcVersion}-${forgeVersion}`
  const forgeInstallerPath = await ensureInstallerArchive(
    options.mcPath,
    `net/minecraftforge/forge/${forgeArtifact}/forge-${forgeArtifact}-installer.jar`,
    `${BMCL_MAVEN}net/minecraftforge/forge/${forgeArtifact}/forge-${forgeArtifact}-installer.jar`,
    options
  )
  await predownloadInstallerLibraries(forgeInstallerPath, options.mcPath, options)

  options.onDetail(`正在安装 Forge ${forgeVersion}…`, 20)
  const task = installForgeTask(
    { mcversion: options.mcVersion, version: forgeVersion },
    options.mcPath,
    {
      side: 'client',
      java: options.javaPath,
      mavenHost: [BMCL_MAVEN],
      agent: xmclDownloadAgent,
      headers: XMCL_HEADERS
    }
  )
  options.onTask?.(() => task.cancel())
  const versionId = await task.startAndWait({
    onUpdate: (child) => {
      const ratio = task.total > 0 ? task.progress / task.total : 0
      options.onDetail(
        child?.name === 'downloadInstaller' ? '正在下载 Forge 安装器…' : '正在处理 Forge 安装…',
        Math.min(95, 20 + ratio * 70)
      )
    }
  })
  options.onDetail('Forge 加载器安装完成', 100)
  return { versionId, loaderVersion: forgeVersion }
}

async function installNeoForge(options: LoaderInstallOptions): Promise<LoaderInstallResult> {
  if (!options.javaPath) throw new Error('安装 NeoForge 需要 Java 运行时')
  options.onDetail('正在获取 NeoForge 版本列表…', 5)
  const list = await fetchJson<
    Array<{ version: string; rawVersion?: string; type?: string }>
  >(`${BMCL_API}/neoforge/list/${encodeURIComponent(options.mcVersion)}`)
  if (!Array.isArray(list) || !list.length) {
    throw new Error(`Minecraft ${options.mcVersion} 暂时没有 NeoForge 版本`)
  }
  const candidates = list
    .map((item) => item.version)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
  const stable = candidates.filter((value) => !/alpha|beta/i.test(value))
  const neoVersion = (stable.length ? stable : candidates).sort((left, right) =>
    compareVersion(right, left)
  )[0]
  if (!neoVersion) throw new Error('NeoForge 版本列表为空')

  const neoInstallerPath = await ensureInstallerArchive(
    options.mcPath,
    `net/neoforged/neoforge/${neoVersion}/neoforge-${neoVersion}-installer.jar`,
    `${BMCL_MAVEN}net/neoforged/neoforge/${neoVersion}/neoforge-${neoVersion}-installer.jar`,
    options
  )
  await predownloadInstallerLibraries(neoInstallerPath, options.mcPath, options)

  options.onDetail(`正在安装 NeoForge ${neoVersion}…`, 20)
  const task = installNeoForgedTask('neoforge', neoVersion, options.mcPath, {
    side: 'client',
    java: options.javaPath,
    mavenHost: [BMCL_MAVEN],
    agent: xmclDownloadAgent,
    headers: XMCL_HEADERS
  })
  options.onTask?.(() => task.cancel())
  const versionId = await task.startAndWait({
    onUpdate: (child) => {
      const ratio = task.total > 0 ? task.progress / task.total : 0
      options.onDetail(
        child?.name === 'downloadInstaller' ? '正在下载 NeoForge 安装器…' : '正在处理 NeoForge 安装…',
        Math.min(95, 20 + ratio * 70)
      )
    }
  })
  options.onDetail('NeoForge 加载器安装完成', 100)
  return { versionId, loaderVersion: neoVersion }
}

async function ensureInstallerArchive(
  mcPath: string,
  relativePath: string,
  url: string,
  options: LoaderInstallOptions
): Promise<string> {
  const destination = join(mcPath, 'libraries', relativePath)
  if (isUsableZipFile(destination)) return destination
  options.onDetail('正在下载安装器…', 14)
  mkdirSync(dirname(destination), { recursive: true })
  const response = await requestResponse(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(180_000)
  })
  if (!response.ok || !response.body) {
    throw new Error(`安装器下载失败（HTTP ${response.status}）`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  if (!isUsableZipBuffer(buffer)) {
    throw new Error('下载的安装器不是有效的 ZIP/JAR 文件')
  }
  const temporary = `${destination}.part-${process.pid}`
  writeFileSync(temporary, buffer)
  rmSync(destination, { force: true })
  renameSync(temporary, destination)
  return destination
}

async function predownloadInstallerLibraries(
  installerPath: string,
  mcPath: string,
  options: LoaderInstallOptions
): Promise<void> {
  options.onDetail('正在准备安装器依赖…', 16)
  const zip = await open(installerPath, { lazyEntries: true, autoClose: false })
  let profile: { libraries?: Array<Record<string, any>> } = {}
  let versionJson: { libraries?: Array<Record<string, any>> } = {}
  try {
    const [profileEntry, versionEntry] = await filterEntries(zip, [
      'install_profile.json',
      'version.json'
    ])
    if (profileEntry) {
      profile = JSON.parse((await readEntry(zip, profileEntry)).toString('utf8'))
    }
    if (versionEntry) {
      versionJson = JSON.parse((await readEntry(zip, versionEntry)).toString('utf8'))
    }
  } finally {
    zip.close()
  }

  const artifacts = new Map<
    string,
    { path: string; url: string; sha1?: string; size?: number }
  >()
  const collect = (libraries?: Array<Record<string, any>>): void => {
    for (const library of libraries || []) {
      const artifact = library.downloads?.artifact
      if (!artifact?.url) continue
      let path = artifact.path as string | undefined
      if (!path && typeof library.name === 'string') {
        try {
          path = LibraryInfo.resolve(library.name).path
        } catch {
          path = undefined
        }
      }
      if (!path) continue
      artifacts.set(path, {
        path,
        url: artifact.url,
        sha1: artifact.sha1,
        size: artifact.size
      })
    }
  }
  collect(profile.libraries)
  collect(versionJson.libraries)

  const missing = [...artifacts.values()].filter((artifact) => {
    const destination = join(mcPath, 'libraries', artifact.path)
    if (!existsSync(destination)) return true
    try {
      const size = statSync(destination).size
      if (size === 0) return true
      return Boolean(artifact.size && artifact.size > 0 && size !== artifact.size)
    } catch {
      return true
    }
  })
  if (!missing.length) return

  let completed = 0
  let cursor = 0
  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor
      cursor += 1
      const artifact = missing[index]
      if (!artifact) return
      await downloadInstallerLibrary(artifact, mcPath)
      completed += 1
      options.onDetail(
        `正在准备安装器依赖 ${completed}/${missing.length}…`,
        Math.min(60, 18 + (completed / missing.length) * 40)
      )
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, missing.length) }, () => worker()))
}

async function downloadInstallerLibrary(
  artifact: { path: string; url: string; sha1?: string; size?: number },
  mcPath: string
): Promise<void> {
  const destination = join(mcPath, 'libraries', artifact.path)
  mkdirSync(dirname(destination), { recursive: true })
  const urls = [
    `${BMCL_MAVEN}${artifact.path}`,
    artifact.url,
    `https://repo1.maven.org/maven2/${artifact.path}`
  ]
  let lastError: unknown
  for (const url of [...new Set(urls)]) {
    try {
      const response = await requestResponse(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(90_000)
      })
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status} ${url}`)
        continue
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      if (artifact.sha1) {
        const hash = createHash('sha1').update(buffer).digest('hex')
        if (hash !== artifact.sha1) {
          lastError = new Error(`校验失败 ${artifact.path}`)
          continue
        }
      }
      if (artifact.size && artifact.size > 0 && buffer.length !== artifact.size) {
        lastError = new Error(`文件大小不符 ${artifact.path}`)
        continue
      }
      const temporary = `${destination}.part-${process.pid}`
      writeFileSync(temporary, buffer)
      rmSync(destination, { force: true })
      renameSync(temporary, destination)
      return
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(
    `安装器依赖下载失败：${artifact.path}（${
      lastError instanceof Error ? lastError.message : String(lastError)
    }）`
  )
}

function isUsableZipFile(path: string): boolean {
  if (!existsSync(path)) return false
  try {
    return isUsableZipBuffer(readFileSync(path))
  } catch {
    return false
  }
}

function isUsableZipBuffer(buffer: Buffer): boolean {
  if (buffer.length < 200_000) return false
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
    return false
  }
  const tailStart = Math.max(0, buffer.length - 65_557)
  return buffer.subarray(tailStart).includes(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
}

interface FabricProfile {
  id: string
  inheritsFrom?: string
  libraries?: Array<{ name: string; url?: string; sha1?: string; size?: number }>
  [key: string]: unknown
}

interface QuiltProfile {
  id?: string
  inheritsFrom?: string
  libraries?: Array<{ name: string; url?: string; sha1?: string; size?: number }>
  [key: string]: unknown
}

function writeLoaderProfile(mcPath: string, profile: FabricProfile | QuiltProfile): string {
  const id =
    profile.id ||
    `loader-${(profile as QuiltProfile).inheritsFrom || 'unknown'}-${Date.now().toString(36)}`
  const directory = join(mcPath, 'versions', id)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, `${id}.json`), JSON.stringify({ ...profile, id }, null, 2), 'utf8')
  return id
}

async function fetchJson<T>(url: string, attempts = 3): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await requestResponse(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(45_000)
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return (await response.json()) as T
    } catch (error) {
      lastError = error
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)))
      }
    }
  }
  throw new Error(lastError instanceof Error ? lastError.message : String(lastError))
}

function compareVersion(left: string, right: string): number {
  const leftParts = left.split(/[.\-+]/).map((part) => Number(part) || 0)
  const rightParts = right.split(/[.\-+]/).map((part) => Number(part) || 0)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0)
    if (difference !== 0) return difference
  }
  return 0
}

export function loaderDisplayName(loader: LoaderType): string {
  if (loader === 'vanilla') return '原版'
  if (loader === 'fabric') return 'Fabric'
  if (loader === 'quilt') return 'Quilt'
  if (loader === 'forge') return 'Forge'
  return 'NeoForge'
}
