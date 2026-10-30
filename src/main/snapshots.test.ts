import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Instance } from '../shared/types'
import type { LauncherStore } from './store'

const runtime = vi.hoisted(() => ({ running: false }))

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpdir(),
    getVersion: () => '0.0.3-beta'
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString()
  }
}))

vi.mock('./minecraft', () => ({
  isGameRunning: () => runtime.running
}))

import {
  archiveSnapshots,
  createSnapshot,
  deleteSnapshot,
  listSnapshots,
  previewSnapshot,
  restoreSnapshot
} from './snapshots'

const roots: string[] = []

afterEach(() => {
  runtime.running = false
  while (roots.length) rmSync(roots.pop() as string, { recursive: true, force: true })
})

function setup(): {
  root: string
  instance: Instance
  store: LauncherStore
  gamePath: string
} {
  const root = mkdtempSync(join(tmpdir(), 'fangjie-snapshots-'))
  roots.push(root)
  const instance: Instance = {
    id: 'i1',
    name: 'Snapshot Test',
    mcVersion: '1.20.1',
    loader: 'fabric',
    loaderVersion: '0.15.11',
    versionId: '1.20.1',
    icon: '',
    accent: '#b8e85c',
    createdAt: 1,
    totalPlayTimeMs: 0,
    mods: []
  }
  const store = {
    instancesPath: join(root, 'instances'),
    settings: { javaPath: 'C:/Java/bin/java.exe' },
    getInstance: (id: string) => (id === instance.id ? instance : undefined),
    instanceGamePath: () => join(root, 'instances', 'i1', '.minecraft')
  } as unknown as LauncherStore
  const gamePath = join(root, 'instances', 'i1', '.minecraft')
  mkdirSync(join(gamePath, 'saves', 'World A'), { recursive: true })
  mkdirSync(join(gamePath, 'config'), { recursive: true })
  writeFileSync(join(gamePath, 'saves', 'World A', 'level.dat'), Buffer.alloc(2048, 7))
  writeFileSync(join(gamePath, 'saves', 'World A', 'region.mca'), Buffer.alloc(4096, 8))
  writeFileSync(join(gamePath, 'config', 'example.toml'), 'enabled = true\n')
  writeFileSync(join(gamePath, 'options.txt'), 'fov:0.0\n')
  return { root, instance, store, gamePath }
}

describe('snapshots', () => {
  it('creates a streamed zip with sidecar metadata and restores it', async () => {
    const { root, instance, store, gamePath } = setup()
    const meta = await createSnapshot(store, 'i1', 'before test')
    expect(meta.kind).toBe('manual')
    expect(meta.size).toBeGreaterThan(0)
    expect(meta.fileCount).toBe(4)
    expect(meta.worlds).toEqual([{ name: 'World A', bytes: 2048 + 4096 }])
    expect(meta.configFiles).toBe(1)
    expect(meta.javaPath).toContain('java.exe')
    expect(existsSync(join(root, 'instances', 'i1', '.fangjie', 'snapshots', `${meta.id}.zip`))).toBe(
      true
    )
    expect(
      existsSync(join(root, 'instances', 'i1', '.fangjie', 'snapshots', `${meta.id}.snapshot.json`))
    ).toBe(true)

    const list = await listSnapshots(store, 'i1')
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(meta.id)

    const preview = await previewSnapshot(store, 'i1', meta.id)
    expect(preview.canRestore).toBe(true)
    expect(preview.overwriteCount).toBeGreaterThanOrEqual(3)
    expect(preview.items.find((item) => item.path === 'saves/World A')?.action).toBe('overwrite')

    writeFileSync(join(gamePath, 'saves', 'World A', 'level.dat'), 'changed')
    writeFileSync(join(gamePath, 'config', 'example.toml'), 'changed')
    rmSync(join(gamePath, 'options.txt'))
    const restored = await restoreSnapshot(store, 'i1', meta.id)
    expect(restored.restoredFiles).toBe(4)
    expect(readFileSync(join(gamePath, 'saves', 'World A', 'level.dat'))).toEqual(Buffer.alloc(2048, 7))
    expect(readFileSync(join(gamePath, 'config', 'example.toml'), 'utf8')).toBe('enabled = true\n')
    expect(readFileSync(join(gamePath, 'options.txt'), 'utf8')).toBe('fov:0.0\n')

    const after = await listSnapshots(store, 'i1')
    expect(after.some((item) => item.id === restored.safetySnapshotId && item.kind === 'safety')).toBe(
      true
    )
    expect(instance.id).toBe('i1')
  })

  it('blocks restore while the game is running', async () => {
    const { store } = setup()
    const meta = await createSnapshot(store, 'i1')
    runtime.running = true
    const preview = await previewSnapshot(store, 'i1', meta.id)
    expect(preview.canRestore).toBe(false)
    expect(preview.blockedReason).toContain('游戏正在运行')
    await expect(restoreSnapshot(store, 'i1', meta.id)).rejects.toThrow('游戏正在运行')
  })

  it('keeps only the newest five automatic snapshots', async () => {
    const { store } = setup()
    for (let index = 0; index < 6; index += 1) {
      await createSnapshot(store, 'i1', `auto ${index}`, 'auto')
    }
    const autos = (await listSnapshots(store, 'i1')).filter((item) => item.kind === 'auto')
    expect(autos).toHaveLength(5)
    expect(autos.map((item) => item.note)).not.toContain('auto 0')
  })

  it('deletes snapshots and archives remaining files before instance removal', async () => {
    const { root, instance, store } = setup()
    const first = await createSnapshot(store, 'i1', 'keep')
    const second = await createSnapshot(store, 'i1', 'delete me')
    await deleteSnapshot(store, 'i1', second.id)
    expect((await listSnapshots(store, 'i1')).map((item) => item.id)).toEqual([first.id])

    const archive = await archiveSnapshots(store, instance, join(root, 'snapshots-archive'))
    expect(archive.count).toBe(1)
    expect(existsSync(join(archive.path, `${first.id}.zip`))).toBe(true)
    expect(existsSync(join(archive.path, `${first.id}.snapshot.json`))).toBe(true)
  })
})
