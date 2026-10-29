import { existsSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { InstalledMod, Instance } from '../shared/types'
import type { LauncherStore } from './store'
import { safeFileName } from './store'

export function modsDirectory(store: LauncherStore, instance: Instance): string {
  return join(store.instanceGamePath(instance), 'mods')
}

export function listInstanceMods(store: LauncherStore, instance: Instance): InstalledMod[] {
  const directory = modsDirectory(store, instance)
  if (!existsSync(directory)) return []
  const files = new Set(readdirSync(directory).filter((name) => isJarName(name)))
  const records = new Map(instance.mods.map((mod) => [safeFileName(mod.fileName), mod]))
  const result: InstalledMod[] = []

  for (const [fileName, record] of records) {
    const enabledName = fileName.endsWith('.disabled') ? fileName.slice(0, -'.disabled'.length) : fileName
    const disabledName = `${enabledName}.disabled`
    const actual = files.has(enabledName) ? enabledName : files.has(disabledName) ? disabledName : undefined
    if (!actual) continue
    const enabled = actual.endsWith('.jar') && !actual.endsWith('.jar.disabled')
    const stat = safeStat(join(directory, actual))
    result.push({
      ...record,
      fileName: actual,
      enabled,
      installedAt: record.installedAt || stat?.mtimeMs || Date.now()
    })
  }

  const knownFiles = new Set(result.map((mod) => mod.fileName))
  for (const file of files) {
    if (knownFiles.has(file)) continue
    const enabled = !file.endsWith('.disabled')
    const stat = safeStat(join(directory, file))
    const title = file.replace(/\.jar(\.disabled)?$/, '').replace(/[-_]/g, ' ')
    result.push({
      projectId: `local:${file}`,
      slug: 'local',
      title,
      versionId: 'local',
      versionName: '本地文件',
      fileName: file,
      enabled,
      installedAt: stat?.mtimeMs || Date.now()
    })
  }

  return result.sort((left, right) => {
    if (left.enabled !== right.enabled) return left.enabled ? -1 : 1
    return left.title.localeCompare(right.title, 'zh-CN')
  })
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

function safeStat(path: string): { mtimeMs: number } | undefined {
  try {
    return { mtimeMs: statSync(path).mtimeMs }
  } catch {
    return undefined
  }
}

export function ensureModsDirectory(store: LauncherStore, instance: Instance): string {
  const directory = modsDirectory(store, instance)
  store.ensureInstanceFolders(instance)
  return directory
}

export function importedFileName(name: string): string {
  return safeFileName(basename(name))
}
