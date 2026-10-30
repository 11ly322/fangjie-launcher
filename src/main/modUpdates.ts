import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  InstalledMod,
  Instance,
  ModBackupEntry,
  ModProject,
  ModSource,
  ModUpdateEntry,
  ModUpdatePreference,
  ModUpdateReport,
  ModUpdateResult,
  ModVersion
} from '../shared/types'
import { MODDED_LOADERS } from '../shared/constants'
import { errorMessage } from './java'
import { isOffline } from './networkPolicy'
import {
  getModProject,
  startModInstall
} from './modrinth'
import {
  getCurseForgeProject,
  startCurseForgeInstall
} from './curseforge'
import {
  listInstanceMods,
  modsDirectory,
  saveInstalledMods,
  setModEnabled
} from './mods'
import { safeFileName, type LauncherStore } from './store'
import type { TaskManager } from './tasks'

const CHECK_CONCURRENCY = 4
const BACKUP_DIR = ['.fangjie', 'backups', 'mods']

interface BackupReceipt extends ModBackupEntry {
  record: InstalledMod
  updatedVersionId?: string
}

interface CreatedBackup {
  receipt: BackupReceipt
  directory: string
}

export function inferModSource(mod: InstalledMod): ModSource | undefined {
  if (mod.source) return mod.source
  if (mod.projectId.startsWith('cf-')) return 'curseforge'
  if (mod.projectId.startsWith('local:') || mod.versionId === 'local') return undefined
  return mod.projectId ? 'modrinth' : undefined
}

export function dependencyDiff(
  mod: InstalledMod,
  latest: ModVersion
): { added: string[]; removed: string[] } {
  const required = [
    ...new Set(
      latest.dependencies
        .filter((dependency) => dependency.dependency_type === 'required' && dependency.project_id)
        .map((dependency) => dependency.project_id as string)
    )
  ]
  const current = new Set(mod.dependencies || [])
  return {
    added: required.filter((projectId) => projectId !== mod.projectId && !current.has(projectId)),
    removed: [...current].filter((projectId) => !required.includes(projectId))
  }
}

export async function checkModUpdates(
  store: LauncherStore,
  instanceId: string
): Promise<ModUpdateReport> {
  const instance = requireInstance(store, instanceId)
  const mods = listInstanceMods(store, instance)
  const checkedAt = Date.now()
  if (isOffline()) {
    const entries = mods.map((mod) => offlineEntry(mod, '离线模式已开启'))
    return buildReport(checkedAt, true, entries)
  }

  const entries = await mapLimit(mods, CHECK_CONCURRENCY, (mod) => checkEntry(instance, mod))
  return buildReport(checkedAt, false, entries)
}

export async function setModUpdatePreference(
  store: LauncherStore,
  instanceId: string,
  projectId: string,
  action: ModUpdatePreference,
  versionId?: string
): Promise<InstalledMod[]> {
  const instance = requireInstance(store, instanceId)
  const mod = instance.mods.find((item) => item.projectId === projectId)
  if (!mod) throw new Error('找不到这个已安装模组')
  const patch: Partial<InstalledMod> = {}
  switch (action) {
    case 'pin':
      patch.pinnedVersionId = versionId || mod.versionId
      patch.skippedVersionId = undefined
      break
    case 'unpin':
      patch.pinnedVersionId = undefined
      break
    case 'skip':
      if (!versionId) throw new Error('缺少要跳过的版本')
      patch.skippedVersionId = versionId
      break
    case 'unskip':
      patch.skippedVersionId = undefined
      break
    default:
      throw new Error('未知的更新偏好')
  }
  saveInstalledMods(
    store,
    instanceId,
    instance.mods.map((item) => (item.projectId === projectId ? { ...item, ...patch } : item))
  )
  const refreshed = store.getInstance(instanceId) || instance
  return listInstanceMods(store, refreshed)
}

export async function updateInstalledMod(
  store: LauncherStore,
  tasks: TaskManager,
  instanceId: string,
  projectId: string,
  onChange: (reason: string) => void
): Promise<ModUpdateResult> {
  let instance = requireInstance(store, instanceId)
  const mod = listInstanceMods(store, instance).find((item) => item.projectId === projectId)
  if (!mod) throw new Error('找不到这个已安装模组')
  if (mod.pinnedVersionId) throw new Error('这个模组已固定版本，请先取消固定')
  const source = inferModSource(mod)
  if (!source) throw new Error('无法识别这个模组的来源，不能自动更新')

  const latest = await latestCompatible(instance, mod, source)
  if (latest.id === mod.versionId) throw new Error('已经是最新兼容版本')
  if (mod.skippedVersionId === latest.id) throw new Error('这个版本已被跳过，请先取消跳过')

  const previousProjects = new Set(instance.mods.map((item) => item.projectId))
  const backup = createBackup(store, instance, mod, source)
  let taskId: string | undefined
  try {
    const install = source === 'curseforge' ? startCurseForgeInstall : startModInstall
    const started = await install({
      store,
      tasks,
      instanceId,
      projectId: mod.projectId,
      versionId: latest.id,
      force: true,
      onChange
    })
    taskId = started.taskId
    await tasks.waitFor(taskId)

    instance = requireInstance(store, instanceId)
    if (!mod.enabled) {
      const installed = listInstanceMods(store, instance).find(
        (item) => item.projectId === mod.projectId
      )
      if (installed?.enabled) {
        setModEnabled(store, instance, installed.fileName, false)
        instance = requireInstance(store, instanceId)
      }
    }
    const current = listInstanceMods(store, instance).find((item) => item.projectId === mod.projectId)
    saveInstalledMods(
      store,
      instanceId,
      instance.mods.map((item) =>
        item.projectId === mod.projectId
          ? {
              ...item,
              source,
              fileName: current?.fileName || item.fileName,
              enabled: current?.enabled ?? item.enabled,
              skippedVersionId: undefined
            }
          : item
      )
    )
    updateReceipt(backup.directory, backup.receipt, {
      status: 'committed',
      updatedVersionId: latest.id
    })
    onChange('mods')
    return {
      projectId,
      updated: true,
      taskId,
      backupId: backup.receipt.id,
      fromVersionId: mod.versionId,
      toVersionId: latest.id
    }
  } catch (error) {
    const message = errorMessage(error)
    try {
      restoreBackup(store, instanceId, backup.receipt.id)
      removeProjectsAddedByUpdate(store, instanceId, previousProjects)
    } catch (rollbackError) {
      throw new Error(`${message}；自动回滚失败：${errorMessage(rollbackError)}`)
    }
    onChange('mods')
    return {
      projectId,
      updated: false,
      taskId,
      backupId: backup.receipt.id,
      fromVersionId: mod.versionId,
      toVersionId: latest.id,
      rolledBack: true
    }
  }
}

export async function listModBackups(
  store: LauncherStore,
  instanceId: string
): Promise<ModBackupEntry[]> {
  const instance = requireInstance(store, instanceId)
  const directory = backupRoot(store, instance)
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readReceipt(join(directory, entry.name)))
    .filter((receipt): receipt is BackupReceipt => Boolean(receipt))
    .sort((left, right) => right.createdAt - left.createdAt)
    .map(({ record: _record, ...entry }) => entry)
}

export async function rollbackModUpdate(
  store: LauncherStore,
  instanceId: string,
  backupId: string
): Promise<{ mods: InstalledMod[]; backup: ModBackupEntry }> {
  const receipt = restoreBackup(store, instanceId, backupId)
  const instance = requireInstance(store, instanceId)
  const { record: _record, ...backup } = receipt
  return {
    mods: listInstanceMods(store, instance),
    backup
  }
}

function requireInstance(store: LauncherStore, instanceId: string): Instance {
  const instance = store.getInstance(instanceId)
  if (!instance) throw new Error('找不到这个实例')
  return instance
}

async function checkEntry(instance: Instance, mod: InstalledMod): Promise<ModUpdateEntry> {
  const source = inferModSource(mod)
  const pinned = Boolean(mod.pinnedVersionId)
  const skipped = Boolean(mod.skippedVersionId)
  if (!source || mod.versionId === 'local') {
    return unavailableEntry(mod, source, '本地文件或来源无法识别，不能自动更新')
  }
  if (pinned) {
    return {
      ...baseEntry(mod, source),
      status: 'current',
      reason: '已固定版本，不自动更新',
      pinned,
      skipped
    }
  }
  try {
    const latest = await latestCompatible(instance, mod, source)
    const diff = dependencyDiff(mod, latest)
    const entry: ModUpdateEntry = {
      ...baseEntry(mod, source),
      latestVersionId: latest.id,
      latestVersionName: latest.name || latest.version_number,
      latestVersionNumber: latest.version_number,
      pinned,
      skipped,
      addedDependencies: diff.added,
      removedDependencies: diff.removed
    }
    if (latest.id === mod.versionId) {
      return { ...entry, status: 'current' }
    }
    if (mod.skippedVersionId === latest.id) {
      return { ...entry, status: 'current', reason: '已跳过这个版本' }
    }
    return { ...entry, status: 'update' }
  } catch (error) {
    return unavailableEntry(mod, source, errorMessage(error))
  }
}

async function latestCompatible(
  instance: Instance,
  mod: InstalledMod,
  source: ModSource
): Promise<ModVersion> {
  if (!MODDED_LOADERS.includes(instance.loader as (typeof MODDED_LOADERS)[number])) {
    throw new Error('原版实例不能更新模组')
  }
  let project: ModProject
  let versions: ModVersion[]
  if (source === 'curseforge') {
    const result = await getCurseForgeProject(mod.projectId, instance)
    project = result.project
    versions = result.versions
  } else {
    const result = await getModProject(mod.projectId, instance)
    project = result.project
    versions = result.versions
  }
  if (project.project_id !== mod.projectId) {
    throw new Error('远程项目与已安装记录不一致，请手动检查')
  }
  const compatible = versions.filter((version) => version.files.length > 0)
  if (!compatible.length) {
    throw new Error(`「${project.title}」没有兼容当前实例的版本`)
  }
  return compatible.find((version) => version.version_type === 'release') || compatible[0]
}

function baseEntry(mod: InstalledMod, source?: ModSource): ModUpdateEntry {
  return {
    projectId: mod.projectId,
    source,
    title: mod.title,
    fileName: mod.fileName,
    currentVersionId: mod.versionId,
    currentVersionName: mod.versionName,
    status: 'unavailable',
    pinned: Boolean(mod.pinnedVersionId),
    skipped: Boolean(mod.skippedVersionId),
    addedDependencies: [],
    removedDependencies: []
  }
}

function unavailableEntry(mod: InstalledMod, source: ModSource | undefined, reason: string): ModUpdateEntry {
  return { ...baseEntry(mod, source), status: 'unavailable', reason }
}

function offlineEntry(mod: InstalledMod, reason: string): ModUpdateEntry {
  return unavailableEntry(mod, inferModSource(mod), reason)
}

function buildReport(checkedAt: number, offline: boolean, entries: ModUpdateEntry[]): ModUpdateReport {
  return {
    checkedAt,
    offline,
    entries,
    counts: {
      update: entries.filter((entry) => entry.status === 'update').length,
      current: entries.filter((entry) => entry.status === 'current').length,
      unavailable: entries.filter((entry) => entry.status === 'unavailable').length,
      total: entries.length
    }
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await mapper(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

function backupRoot(store: LauncherStore, instance: Instance): string {
  return join(store.instancesPath, instance.id, ...BACKUP_DIR)
}

function createBackup(
  store: LauncherStore,
  instance: Instance,
  mod: InstalledMod,
  source: ModSource
): CreatedBackup {
  const directory = backupRoot(store, instance)
  const safeProject = mod.projectId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32)
  const id = `${Date.now()}-${safeProject}-${randomUUID().slice(0, 8)}`
  const target = join(directory, id)
  const files = join(target, 'files')
  mkdirSync(files, { recursive: true })
  const sourceFile = join(modsDirectory(store, instance), safeFileName(mod.fileName))
  if (!existsSync(sourceFile)) throw new Error('找不到当前模组文件，无法创建更新备份')
  const fileName = safeFileName(mod.fileName)
  copyFileSync(sourceFile, join(files, fileName))
  const receipt: BackupReceipt = {
    id,
    projectId: mod.projectId,
    title: mod.title,
    fileName,
    versionId: mod.versionId,
    versionName: mod.versionName,
    source,
    createdAt: Date.now(),
    status: 'committed',
    record: { ...mod, source }
  }
  writeReceipt(target, receipt)
  return { receipt, directory: target }
}

function updateReceipt(
  directory: string,
  receipt: BackupReceipt,
  patch: Partial<BackupReceipt>
): void {
  const current = readReceipt(directory) || receipt
  writeReceipt(directory, { ...current, ...patch })
}

function writeReceipt(directory: string, receipt: BackupReceipt): void {
  writeFileSync(join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2), 'utf8')
}

function readReceipt(directory: string): BackupReceipt | undefined {
  const file = join(directory, 'receipt.json')
  if (!existsSync(file)) return undefined
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<BackupReceipt>
    if (
      typeof parsed.id !== 'string' ||
      typeof parsed.projectId !== 'string' ||
      typeof parsed.fileName !== 'string' ||
      typeof parsed.createdAt !== 'number' ||
      !parsed.record
    ) {
      return undefined
    }
    if (parsed.status !== 'committed' && parsed.status !== 'rolled_back') return undefined
    return parsed as BackupReceipt
  } catch {
    return undefined
  }
}

/**
 * A failed update can pull in prerequisites that were not installed before.
 * Remove only projects that appeared during this transaction; pre-existing
 * mods and the restored root project stay untouched.
 */
function removeProjectsAddedByUpdate(
  store: LauncherStore,
  instanceId: string,
  previousProjects: Set<string>
): void {
  const instance = requireInstance(store, instanceId)
  const added = instance.mods.filter((item) => !previousProjects.has(item.projectId))
  if (added.length === 0) return
  const directory = modsDirectory(store, instance)
  for (const item of added) removeModFiles(directory, item.fileName)
  saveInstalledMods(
    store,
    instanceId,
    instance.mods.filter((item) => previousProjects.has(item.projectId))
  )
}

function restoreBackup(
  store: LauncherStore,
  instanceId: string,
  backupId: string
): BackupReceipt {
  if (!/^[a-zA-Z0-9._-]+$/.test(backupId)) throw new Error('无效的备份编号')
  const instance = requireInstance(store, instanceId)
  const directory = join(backupRoot(store, instance), backupId)
  const receipt = readReceipt(directory)
  if (!receipt) throw new Error('找不到这个更新备份')
  if (receipt.status === 'rolled_back') throw new Error('这个备份已经回滚过了')
  const backupFile = join(directory, 'files', safeFileName(receipt.fileName))
  if (!existsSync(backupFile)) throw new Error('备份文件丢失，无法回滚')

  const mods = [...instance.mods]
  const existing = mods.filter((item) => item.projectId === receipt.projectId)
  const directoryMods = modsDirectory(store, instance)
  for (const item of existing) removeModFiles(directoryMods, item.fileName)
  const remaining = mods.filter((item) => item.projectId !== receipt.projectId)
  const targetName = safeFileName(receipt.record.fileName)
  copyFileSync(backupFile, join(directoryMods, targetName))
  remaining.push({
    ...receipt.record,
    fileName: targetName,
    enabled: targetName.endsWith('.jar') && !targetName.endsWith('.jar.disabled')
  })
  saveInstalledMods(store, instanceId, remaining)
  const updated: BackupReceipt = { ...receipt, status: 'rolled_back', rolledBackAt: Date.now() }
  writeReceipt(directory, updated)
  return updated
}

function removeModFiles(directory: string, fileName: string): void {
  const safe = safeFileName(fileName)
  const base = safe.endsWith('.disabled') ? safe.slice(0, -'.disabled'.length) : safe
  for (const candidate of [base, `${base}.disabled`]) {
    rmSync(join(directory, candidate), { force: true })
  }
}
