import {
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  lstatSync,
  writeFileSync
} from 'node:fs'
import { once } from 'node:events'
import { dirname, join, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { open, openEntryReadStream, readAllEntries, walkEntries } from '@xmcl/unzip'
import type { Entry } from 'yauzl'
import type {
  Instance,
  SnapshotDiffItem,
  SnapshotMeta,
  SnapshotPreview,
  SnapshotRestoreResult,
  SnapshotWorld
} from '../shared/types'
import { isGameRunning } from './minecraft'
import { listInstanceMods } from './mods'
import type { LauncherStore } from './store'

const SNAPSHOT_DIR = ['.fangjie', 'snapshots']
const META_SUFFIX = '.snapshot.json'
const AUTO_RETENTION = 5
const MAX_DIFF_ITEMS = 400
const ALLOWED_ROOTS = ['saves/', 'config/']

interface SnapshotSource {
  name: string
  absolute?: string
  buffer?: Buffer
  bytes: number
  directory?: boolean
}

interface CollectedSnapshot {
  sources: SnapshotSource[]
  worlds: SnapshotWorld[]
  configFiles: number
  fileCount: number
  totalBytes: number
}

interface SnapshotRecord {
  meta: SnapshotMeta
  zipPath: string
  metaPath: string
}

export function snapshotDirectory(store: LauncherStore, instance: Instance): string {
  return join(store.instancesPath, instance.id, ...SNAPSHOT_DIR)
}

export async function createSnapshot(
  store: LauncherStore,
  instanceId: string,
  note = '',
  kind: SnapshotMeta['kind'] = 'manual'
): Promise<SnapshotMeta> {
  const instance = requireInstance(store, instanceId)
  if (isGameRunning(instanceId)) throw new Error('游戏正在运行，请先结束游戏再创建快照')

  const directory = snapshotDirectory(store, instance)
  mkdirSync(directory, { recursive: true })
  const createdAt = Date.now()
  const id = uniqueSnapshotId(directory, createdAt)
  const zipPath = join(directory, `${id}.zip`)
  const partialPath = `${zipPath}.part-${process.pid}`
  const gamePath = store.instanceGamePath(instance)
  const collected = collectSnapshot(store, instance, gamePath)
  const mods = listInstanceMods(store, instance)
  const portableMeta = {
    schemaVersion: 1,
    id,
    instanceId,
    createdAt,
    kind,
    note: note.trim().slice(0, 120),
    modsCount: mods.length,
    gameVersion: instance.mcVersion,
    loader: instance.loader,
    loaderVersion: instance.loaderVersion || '',
    javaPath: store.settings.javaPath || '',
    worlds: collected.worlds,
    configFiles: collected.configFiles,
    totalBytes: collected.totalBytes,
    fileCount: collected.fileCount
  }

  const virtual: SnapshotSource[] = [
    {
      name: 'snapshot.json',
      buffer: Buffer.from(JSON.stringify(portableMeta, null, 2)),
      bytes: 0
    },
    {
      name: 'mods.json',
      buffer: Buffer.from(JSON.stringify(mods, null, 2)),
      bytes: 0
    }
  ]

  try {
    await writeZip(partialPath, [...virtual, ...collected.sources])
    renameSync(partialPath, zipPath)
    const size = statSync(zipPath).size
    const meta: SnapshotMeta = {
      schemaVersion: 1,
      id,
      instanceId,
      createdAt,
      kind,
      note: portableMeta.note,
      size,
      totalBytes: collected.totalBytes,
      fileCount: collected.fileCount,
      modsCount: mods.length,
      gameVersion: instance.mcVersion,
      loader: instance.loader,
      loaderVersion: instance.loaderVersion,
      javaPath: store.settings.javaPath || '',
      worlds: collected.worlds,
      configFiles: collected.configFiles,
      available: true
    }
    writeMetadata(directory, meta)
    if (kind === 'auto') pruneAutoSnapshots(directory)
    return meta
  } catch (error) {
    rmSync(partialPath, { force: true })
    rmSync(zipPath, { force: true })
    throw new Error(`创建快照失败：${errorMessage(error)}`)
  }
}

export async function listSnapshots(
  store: LauncherStore,
  instanceId: string
): Promise<SnapshotMeta[]> {
  const instance = requireInstance(store, instanceId)
  const directory = snapshotDirectory(store, instance)
  if (!existsSync(directory)) return []
  return readdirSync(directory)
    .filter((name) => name.endsWith('.zip') && !name.includes('.part-'))
    .map((name) => readRecord(directory, name.slice(0, -4), instance.id))
    .filter((record): record is SnapshotRecord => Boolean(record))
    .map((record) => record.meta)
    .sort((left, right) => right.createdAt - left.createdAt)
}

export async function previewSnapshot(
  store: LauncherStore,
  instanceId: string,
  snapshotId: string
): Promise<SnapshotPreview> {
  const instance = requireInstance(store, instanceId)
  const record = requireRecord(store, instance, snapshotId)
  const gamePath = store.instanceGamePath(instance)
  const entries = await readZipEntries(record.zipPath)
  const items: SnapshotDiffItem[] = []

  for (const world of record.meta.worlds) {
    const existingPath = join(gamePath, 'saves', world.name)
    const existingBytes = directoryBytes(existingPath)
    items.push({
      path: `saves/${world.name}`,
      kind: 'world',
      action: existingBytes === undefined ? 'create' : 'overwrite',
      incomingBytes: world.bytes,
      existingBytes
    })
  }

  for (const entry of entries) {
    const path = safeArchivePath(entry.fileName)
    if (!path || path.endsWith('/') || path === 'snapshot.json' || path === 'mods.json') continue
    if (path === 'options.txt') {
      const existing = safeSize(join(gamePath, 'options.txt'))
      items.push(configDiff(path, entry.uncompressedSize, existing))
      continue
    }
    if (path.startsWith('config/')) {
      const existing = safeSize(join(gamePath, ...path.split('/')))
      items.push(configDiff(path, entry.uncompressedSize, existing))
    }
  }

  const visible = items.slice(0, MAX_DIFF_ITEMS)
  const createCount = items.filter((item) => item.action === 'create').length
  const overwriteCount = items.filter((item) => item.action === 'overwrite').length
  const unchangedCount = items.filter((item) => item.action === 'unchanged').length
  const gameRunning = isGameRunning(instanceId)
  return {
    snapshot: record.meta,
    items: visible,
    createCount,
    overwriteCount,
    unchangedCount,
    gameRunning,
    canRestore: !gameRunning,
    blockedReason: gameRunning ? '游戏正在运行，请先结束游戏再恢复快照' : undefined
  }
}

export async function restoreSnapshot(
  store: LauncherStore,
  instanceId: string,
  snapshotId: string
): Promise<SnapshotRestoreResult> {
  const instance = requireInstance(store, instanceId)
  if (isGameRunning(instanceId)) throw new Error('游戏正在运行，请先结束游戏再恢复快照')
  const preview = await previewSnapshot(store, instanceId, snapshotId)
  if (!preview.canRestore) throw new Error(preview.blockedReason || '当前无法恢复这个快照')
  const record = requireRecord(store, instance, snapshotId)
  const gamePath = store.instanceGamePath(instance)
  const safety = await createSnapshot(store, instanceId, `恢复「${record.meta.id}」前的自动备份`, 'safety')

  try {
    const result = await extractSnapshot(record.zipPath, gamePath)
    return {
      snapshot: record.meta,
      safetySnapshotId: safety.id,
      restoredFiles: result.files,
      restoredBytes: result.bytes
    }
  } catch (error) {
    try {
      await extractSnapshot(requireRecord(store, instance, safety.id).zipPath, gamePath)
    } catch (rollbackError) {
      throw new Error(`恢复失败：${errorMessage(error)}；安全快照回滚失败：${errorMessage(rollbackError)}`)
    }
    throw new Error(`恢复失败，已自动还原到安全快照：${errorMessage(error)}`)
  }
}

export async function deleteSnapshot(
  store: LauncherStore,
  instanceId: string,
  snapshotId: string
): Promise<void> {
  const instance = requireInstance(store, instanceId)
  if (!validId(snapshotId)) throw new Error('快照 ID 无效')
  const directory = snapshotDirectory(store, instance)
  rmSync(join(directory, `${snapshotId}.zip`), { force: true })
  rmSync(join(directory, `${snapshotId}${META_SUFFIX}`), { force: true })
}

export async function archiveSnapshots(
  store: LauncherStore,
  instance: Instance,
  archiveRoot: string
): Promise<{ count: number; path: string }> {
  const directory = snapshotDirectory(store, instance)
  if (!existsSync(directory)) return { count: 0, path: archiveRoot }
  const target = join(archiveRoot, instance.id)
  mkdirSync(target, { recursive: true })
  let count = 0
  for (const name of readdirSync(directory)) {
    if (!name.endsWith('.zip') && !name.endsWith(META_SUFFIX)) continue
    const source = join(directory, name)
    const destination = join(target, name)
    if (existsSync(destination)) continue
    copyFileSync(source, destination)
    if (name.endsWith('.zip')) count += 1
  }
  return { count, path: target }
}

export function snapshotIdFromName(name: string): string {
  return name.endsWith('.zip') ? name.slice(0, -4) : ''
}

function configDiff(path: string, incomingBytes: number, existingBytes: number | undefined): SnapshotDiffItem {
  return {
    path,
    kind: 'config',
    action: existingBytes === undefined ? 'create' : 'overwrite',
    incomingBytes,
    existingBytes
  }
}

function collectSnapshot(store: LauncherStore, instance: Instance, gamePath: string): CollectedSnapshot {
  const sources: SnapshotSource[] = []
  const worlds: SnapshotWorld[] = []
  let configFiles = 0
  let fileCount = 0
  let totalBytes = 0

  const saves = join(gamePath, 'saves')
  if (existsSync(saves)) {
    for (const name of readdirSync(saves)) {
      const worldPath = join(saves, name)
      if (!isDirectory(worldPath)) continue
      const prefix = `saves/${name}/`
      const before = fileCount
      const bytes = walkDirectory(worldPath, prefix, sources)
      const files = fileCount - before
      worlds.push({ name, bytes })
      totalBytes += bytes
      if (files === 0) {
        sources.push({ name: prefix, bytes: 0, directory: true })
      }
    }
  }

  const options = join(gamePath, 'options.txt')
  if (existsSync(options) && statSync(options).isFile()) {
    const bytes = statSync(options).size
    sources.push({ name: 'options.txt', absolute: options, bytes })
    fileCount += 1
    totalBytes += bytes
  }

  const config = join(gamePath, 'config')
  if (existsSync(config)) {
    const bytes = walkDirectory(config, 'config/', sources)
    configFiles = sources.filter((source) => source.name.startsWith('config/') && !source.directory).length
    totalBytes += bytes
  }

  fileCount = sources.filter((source) => !source.directory).length
  return {
    sources,
    worlds,
    configFiles,
    fileCount,
    totalBytes
  }
}

function walkDirectory(directory: string, prefix: string, sources: SnapshotSource[]): number {
  let bytes = 0
  for (const name of readdirSync(directory)) {
    const full = join(directory, name)
    const stat = lstatSync(full)
    if (stat.isSymbolicLink()) continue
    if (stat.isDirectory()) {
      bytes += walkDirectory(full, `${prefix}${name}/`, sources)
    } else if (stat.isFile()) {
      sources.push({ name: `${prefix}${name}`, absolute: full, bytes: stat.size })
      bytes += stat.size
    }
  }
  return bytes
}

async function writeZip(destination: string, sources: SnapshotSource[]): Promise<void> {
  if (sources.length > 0xffff) throw new Error('快照文件数量超过 ZIP 上限')
  const output = createWriteStream(destination)
  const central: Buffer[] = []
  let position = 0
  let closed = false

  const write = async (buffer: Buffer): Promise<void> => {
    if (!output.write(buffer)) await once(output, 'drain')
    position += buffer.length
  }

  try {
    for (const source of sources) {
      const name = Buffer.from(source.name.replace(/\\/g, '/'), 'utf8')
      const offset = position
      const directory = Boolean(source.directory)
      const flags = directory ? 0x0800 : 0x0808
      const { time, date } = dosDateTime(new Date())
      const local = Buffer.alloc(30)
      local.writeUInt32LE(0x04034b50, 0)
      local.writeUInt16LE(20, 4)
      local.writeUInt16LE(flags, 6)
      local.writeUInt16LE(0, 8)
      local.writeUInt16LE(time, 10)
      local.writeUInt16LE(date, 12)
      local.writeUInt32LE(0, 14)
      local.writeUInt32LE(0, 18)
      local.writeUInt32LE(0, 22)
      local.writeUInt16LE(name.length, 26)
      local.writeUInt16LE(0, 28)
      await write(local)
      await write(name)

      let crc = 0
      let bytes = 0
      if (!directory && source.buffer) {
        crc = crc32(source.buffer)
        bytes = source.buffer.length
        await write(source.buffer)
      } else if (!directory && source.absolute) {
        for await (const chunk of createReadStream(source.absolute, { highWaterMark: 64 * 1024 })) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
          crc = crc32(buffer, crc)
          bytes += buffer.length
          await write(buffer)
        }
      }

      if (!directory) {
        const descriptor = Buffer.alloc(16)
        descriptor.writeUInt32LE(0x08074b50, 0)
        descriptor.writeUInt32LE(crc >>> 0, 4)
        descriptor.writeUInt32LE(bytes, 8)
        descriptor.writeUInt32LE(bytes, 12)
        await write(descriptor)
      }

      const centralHeader = Buffer.alloc(46)
      centralHeader.writeUInt32LE(0x02014b50, 0)
      centralHeader.writeUInt16LE(20, 4)
      centralHeader.writeUInt16LE(20, 6)
      centralHeader.writeUInt16LE(flags, 8)
      centralHeader.writeUInt16LE(0, 10)
      centralHeader.writeUInt16LE(time, 12)
      centralHeader.writeUInt16LE(date, 14)
      centralHeader.writeUInt32LE(crc >>> 0, 16)
      centralHeader.writeUInt32LE(bytes, 20)
      centralHeader.writeUInt32LE(bytes, 24)
      centralHeader.writeUInt16LE(name.length, 28)
      centralHeader.writeUInt16LE(0, 30)
      centralHeader.writeUInt16LE(0, 32)
      centralHeader.writeUInt16LE(0, 34)
      centralHeader.writeUInt16LE(0, 36)
      centralHeader.writeUInt32LE(0, 38)
      centralHeader.writeUInt32LE(offset, 42)
      central.push(Buffer.concat([centralHeader, name]))
    }

    const centralOffset = position
    for (const entry of central) await write(entry)
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(0, 4)
    end.writeUInt16LE(0, 6)
    end.writeUInt16LE(sources.length, 8)
    end.writeUInt16LE(sources.length, 10)
    end.writeUInt32LE(position - centralOffset, 12)
    end.writeUInt32LE(centralOffset, 16)
    end.writeUInt16LE(0, 20)
    await write(end)
    output.end()
    await once(output, 'finish')
    closed = true
  } finally {
    if (!closed) output.destroy()
  }
}

async function extractSnapshot(
  zipPath: string,
  gamePath: string
): Promise<{ files: number; bytes: number }> {
  const zip = await open(zipPath)
  let files = 0
  let bytes = 0
  try {
    await walkEntries(zip, async (entry: Entry) => {
      let path: string | null
      try {
        path = safeArchivePath(entry.fileName)
      } catch {
        throw new Error('快照包含不安全的路径，已拒绝恢复')
      }
      if (!path || path === 'snapshot.json' || path === 'mods.json') return false
      if (!isRestorablePath(path)) return false
      const destination = resolve(gamePath, ...path.split('/'))
      if (!isInside(gamePath, destination)) throw new Error('快照包含不安全的路径，已拒绝恢复')
      if (path.endsWith('/')) {
        mkdirSync(destination, { recursive: true })
        return false
      }
      mkdirSync(dirname(destination), { recursive: true })
      const temporary = `${destination}.restore-${process.pid}`
      const entryStream = await openEntryReadStream(zip, entry)
      await pipeline(entryStream, createWriteStream(temporary))
      try {
        renameSync(temporary, destination)
      } catch {
        rmSync(destination, { force: true })
        renameSync(temporary, destination)
      }
      files += 1
      bytes += entry.uncompressedSize
      return false
    })
    return { files, bytes }
  } finally {
    zip.close()
  }
}

function isRestorablePath(path: string): boolean {
  if (path === 'options.txt') return true
  return ALLOWED_ROOTS.some((root) => path.startsWith(root))
}

function readRecord(directory: string, id: string, instanceId: string): SnapshotRecord | null {
  if (!validId(id)) return null
  const zipPath = join(directory, `${id}.zip`)
  if (!existsSync(zipPath)) return null
  const metaPath = join(directory, `${id}${META_SUFFIX}`)
  let meta: SnapshotMeta
  try {
    meta = JSON.parse(readFileSync(metaPath, 'utf8')) as SnapshotMeta
    if (!meta || meta.instanceId !== instanceId || meta.id !== id) throw new Error('metadata mismatch')
  } catch {
    const stat = statSync(zipPath)
    meta = {
      schemaVersion: 1,
      id,
      instanceId,
      createdAt: stat.mtimeMs,
      kind: 'manual',
      note: '元数据缺失',
      size: stat.size,
      totalBytes: 0,
      fileCount: 0,
      modsCount: 0,
      gameVersion: '',
      loader: 'vanilla',
      javaPath: '',
      worlds: [],
      configFiles: 0,
      available: true
    }
  }
  return { meta: { ...meta, available: true }, zipPath, metaPath }
}

function writeMetadata(directory: string, meta: SnapshotMeta): void {
  const target = join(directory, `${meta.id}${META_SUFFIX}`)
  const temporary = `${target}.part-${process.pid}`
  writeFileSync(temporary, JSON.stringify(meta, null, 2), 'utf8')
  renameSync(temporary, target)
}

function pruneAutoSnapshots(directory: string): void {
  const autos = readdirSync(directory)
    .filter((name) => name.endsWith(META_SUFFIX))
    .map((name) => {
      try {
        return JSON.parse(readFileSync(join(directory, name), 'utf8')) as SnapshotMeta
      } catch {
        return null
      }
    })
    .filter((meta): meta is SnapshotMeta => meta !== null && meta.kind === 'auto')
    .sort((left, right) => right.createdAt - left.createdAt)
  for (const stale of autos.slice(AUTO_RETENTION)) {
    rmSync(join(directory, `${stale.id}.zip`), { force: true })
    rmSync(join(directory, `${stale.id}${META_SUFFIX}`), { force: true })
  }
}

async function readZipEntries(zipPath: string): Promise<Entry[]> {
  const zip = await open(zipPath)
  try {
    return await readAllEntries(zip)
  } finally {
    zip.close()
  }
}

function requireInstance(store: LauncherStore, instanceId: string): Instance {
  const instance = store.getInstance(instanceId)
  if (!instance) throw new Error('找不到这个实例')
  return instance
}

function requireRecord(
  store: LauncherStore,
  instance: Instance,
  snapshotId: string
): SnapshotRecord {
  const record = readRecord(snapshotDirectory(store, instance), snapshotId, instance.id)
  if (!record) throw new Error('找不到这个快照')
  return record
}

function directoryBytes(directory: string): number | undefined {
  if (!existsSync(directory)) return undefined
  let total = 0
  for (const name of readdirSync(directory)) {
    const full = join(directory, name)
    const stat = lstatSync(full)
    if (stat.isSymbolicLink()) continue
    if (stat.isDirectory()) total += directoryBytes(full) || 0
    else if (stat.isFile()) total += stat.size
  }
  return total
}

function safeSize(path: string): number | undefined {
  try {
    return statSync(path).isFile() ? statSync(path).size : undefined
  } catch {
    return undefined
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function safeArchivePath(fileName: string): string | null {
  const normalized = fileName.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.includes('\0')) return null
  const parts = normalized.split('/')
  if (parts.some((part) => part === '..' || part === '.')) throw new Error('unsafe path')
  if (/^[A-Za-z]:/.test(normalized)) throw new Error('unsafe path')
  return parts.join('/')
}

function isInside(root: string, target: string): boolean {
  const base = resolve(root)
  const full = resolve(target)
  return full === base || full.startsWith(`${base}${sep}`)
}

function uniqueSnapshotId(directory: string, createdAt: number): string {
  const date = new Date(createdAt)
  const pad = (value: number, length = 2): string => String(value).padStart(length, '0')
  const base = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}-${pad(date.getMilliseconds(), 3)}`
  let id = base
  let suffix = 0
  while (existsSync(join(directory, `${id}.zip`))) {
    suffix += 1
    id = `${base}-${suffix}`
  }
  return id
}

function validId(id: string): boolean {
  return /^[0-9A-Za-z._-]+$/.test(id)
}

function dosDateTime(date: Date): { time: number; date: number } {
  return {
    time:
      (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date:
      ((date.getFullYear() - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate()
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function crc32(buffer: Buffer, previous = 0): number {
  let value = (previous ^ 0xffffffff) >>> 0
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
