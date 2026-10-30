import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { InstalledMod, Instance } from '../shared/types'
import type { LauncherStore } from './store'
import { safeFileName } from './store'

interface CachedModFile {
  fileName: string
  mtimeMs: number
  size: number
}

interface ModsIndexFile {
  version: 1
  directoryMtimeMs: number
  files: CachedModFile[]
}

const MODS_INDEX_VERSION = 1

export function modsIndexPath(store: LauncherStore, instance: Instance): string {
  return join(store.instancesPath, instance.id, '.fangjie', 'mods-index.json')
}

function readModsIndex(path: string): ModsIndexFile | undefined {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<ModsIndexFile>
    if (
      raw.version !== MODS_INDEX_VERSION ||
      typeof raw.directoryMtimeMs !== 'number' ||
      !Array.isArray(raw.files)
    ) {
      return undefined
    }
    const files = raw.files.filter(
      (file): file is CachedModFile =>
        Boolean(file) &&
        typeof file.fileName === 'string' &&
        typeof file.mtimeMs === 'number' &&
        typeof file.size === 'number'
    )
    return { version: MODS_INDEX_VERSION, directoryMtimeMs: raw.directoryMtimeMs, files }
  } catch {
    return undefined
  }
}

function writeModsIndex(path: string, index: ModsIndexFile): void {
  try {
    mkdirSync(dirname(path), { recursive: true })
    const temporary = `${path}.${process.pid}.tmp`
    writeFileSync(temporary, JSON.stringify(index), 'utf8')
    renameSync(temporary, path)
  } catch {
    /* the index is an optimization; a failed write must not break mod listing */
  }
}

function buildMods(instance: Instance, files: CachedModFile[]): InstalledMod[] {
  const records = new Map(instance.mods.map((mod) => [safeFileName(mod.fileName), mod]))
  const result: InstalledMod[] = []
  for (const file of files) {
    const enabled = file.fileName.endsWith('.jar') && !file.fileName.endsWith('.jar.disabled')
    const record = records.get(file.fileName)
    if (record) {
      result.push({
        ...record,
        fileName: file.fileName,
        enabled,
        installedAt: record.installedAt || file.mtimeMs
      })
      continue
    }
    const title = file.fileName.replace(/\.jar(\.disabled)?$/, '').replace(/[-_]/g, ' ')
    result.push({
      projectId: `local:${file.fileName}`,
      slug: 'local',
      title,
      versionId: 'local',
      versionName: '本地文件',
      fileName: file.fileName,
      enabled,
      installedAt: file.mtimeMs
    })
  }
  return result.sort((left, right) => {
    if (left.enabled !== right.enabled) return left.enabled ? -1 : 1
    return left.title.localeCompare(right.title, 'zh-CN')
  })
}

export function modsDirectory(store: LauncherStore, instance: Instance): string {
  return join(store.instanceGamePath(instance), 'mods')
}

export function listInstanceMods(store: LauncherStore, instance: Instance): InstalledMod[] {
  const directory = modsDirectory(store, instance)
  if (!existsSync(directory)) return []

  const index = readModsIndex(modsIndexPath(store, instance))
  let directoryMtimeMs = 0
  try {
    directoryMtimeMs = statSync(directory).mtimeMs
  } catch {
    return []
  }

  // The directory mtime is the cheap invalidation check: add/remove/rename
  // changes it without requiring a stat for every installed JAR.
  if (index && index.directoryMtimeMs === directoryMtimeMs) {
    return buildMods(instance, index.files)
  }

  const names = readdirSync(directory).filter((name) => isJarName(name))
  const previous = new Map(index?.files.map((file) => [file.fileName, file]) || [])
  const files: CachedModFile[] = []
  for (const fileName of names) {
    try {
      const stat = statSync(join(directory, fileName))
      const cached = previous.get(fileName)
      files.push(
        cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size
          ? cached
          : { fileName, mtimeMs: stat.mtimeMs, size: stat.size }
      )
    } catch {
      /* a file removed between readdir and stat is simply absent */
    }
  }
  writeModsIndex(modsIndexPath(store, instance), {
    version: MODS_INDEX_VERSION,
    directoryMtimeMs,
    files
  })
  return buildMods(instance, files)
}

export function setModEnabled(
  store: LauncherStore,
  instance: Instance,
  fileName: string,
  enabled: boolean
): InstalledMod[] {
  const directory = modsDirectory(store, instance)
  const safe = safeFileName(fileName)
  const base = safe.endsWith('.disabled') ? safe.slice(0, -'.disabled'.length) : safe
  if (!isJarName(base)) throw new Error('无效的模组文件')
  const current = existsSync(join(directory, base)) ? base : `${base}.disabled`
  const target = enabled ? base : `${base}.disabled`
  if (!existsSync(join(directory, current))) throw new Error('模组文件不存在，可能已被外部删除')
  if (current !== target) renameSync(join(directory, current), join(directory, target))

  const record = instance.mods.find((mod) => mod.fileName === current || mod.fileName === target)
  if (record) {
    store.updateInstance(instance.id, (latest) => ({
      ...latest,
      mods: latest.mods.map((mod) =>
        mod.fileName === current || mod.fileName === target
          ? { ...mod, fileName: target, enabled }
          : mod
      )
    }))
  }
  const refreshed = store.getInstance(instance.id) || instance
  return listInstanceMods(store, refreshed)
}

export function removeMod(store: LauncherStore, instance: Instance, fileName: string): InstalledMod[] {
  const directory = modsDirectory(store, instance)
  const safe = safeFileName(fileName)
  const base = safe.endsWith('.disabled') ? safe.slice(0, -'.disabled'.length) : safe
  for (const candidate of [base, `${base}.disabled`]) {
    const fullPath = join(directory, candidate)
    if (existsSync(fullPath)) rmSync(fullPath, { force: true })
  }
  store.updateInstance(instance.id, (latest) => ({
    ...latest,
    mods: latest.mods.filter((mod) => mod.fileName !== base && mod.fileName !== `${base}.disabled`)
  }))
  const refreshed = store.getInstance(instance.id) || instance
  return listInstanceMods(store, refreshed)
}

export function deleteInstanceData(store: LauncherStore, instance: Instance): void {
  const root = join(store.instancesPath, instance.id)
  rmSync(root, { recursive: true, force: true })
}

export function saveInstalledMods(store: LauncherStore, instanceId: string, mods: InstalledMod[]): void {
  store.updateInstance(instanceId, (latest) => ({ ...latest, mods }))
}

export function isJarName(name: string): boolean {
  return name.endsWith('.jar') || name.endsWith('.jar.disabled')
}

export function ensureModsDirectory(store: LauncherStore, instance: Instance): string {
  const directory = modsDirectory(store, instance)
  store.ensureInstanceFolders(instance)
  return directory
}

export function importedFileName(name: string): string {
  return safeFileName(basename(name))
}
