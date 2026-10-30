import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Instance, InstalledMod, ModVersion } from '../shared/types'
import type { LauncherStore } from './store'

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

vi.mock('./java', () => ({
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error))
}))

vi.mock('./modrinth', () => ({
  getModProject: vi.fn(),
  startModInstall: vi.fn()
}))

vi.mock('./curseforge', () => ({
  getCurseForgeProject: vi.fn(),
  startCurseForgeInstall: vi.fn()
}))

import {
  checkModUpdates,
  dependencyDiff,
  inferModSource,
  listModBackups,
  rollbackModUpdate,
  setModUpdatePreference,
  updateInstalledMod
} from './modUpdates'
import { getModProject, startModInstall } from './modrinth'
import { setOffline } from './networkPolicy'
import type { TaskManager } from './tasks'

const roots: string[] = []

afterEach(() => {
  setOffline(false)
  vi.clearAllMocks()
  while (roots.length) rmSync(roots.pop() as string, { recursive: true, force: true })
})

function installed(overrides: Partial<InstalledMod> = {}): InstalledMod {
  return {
    projectId: 'alpha',
    slug: 'alpha',
    title: 'Alpha',
    versionId: 'v1',
    versionName: '1.0',
    fileName: 'alpha-1.0.jar',
    enabled: true,
    installedAt: 1,
    ...overrides
  }
}

function setup(mods: InstalledMod[]): {
  root: string
  state: { instance: Instance }
  store: LauncherStore
} {
  const root = mkdtempSync(join(tmpdir(), 'fangjie-mod-updates-'))
  roots.push(root)
  const instance: Instance = {
    id: 'i1',
    name: 'Test',
    mcVersion: '1.20.1',
    loader: 'fabric',
    versionId: '1.20.1',
    icon: '',
    accent: '#b8e85c',
    createdAt: 1,
    totalPlayTimeMs: 0,
    mods
  }
  const state = { instance }
  const store = {
    instancesPath: join(root, 'instances'),
    getInstance: (id: string) => (id === state.instance.id ? state.instance : undefined),
    instanceGamePath: (target: Instance) => join(root, 'instances', target.id, '.minecraft'),
    updateInstance: (id: string, update: (current: Instance) => Instance) => {
      if (id === state.instance.id) state.instance = update(state.instance)
      return state.instance
    }
  } as unknown as LauncherStore
  return { root, state, store }
}

function writeModJar(root: string, fileName: string, content = 'jar'): string {
  const directory = join(root, 'instances', 'i1', '.minecraft', 'mods')
  mkdirSync(directory, { recursive: true })
  const path = join(directory, fileName)
  writeFileSync(path, content)
  return path
}

describe('inferModSource', () => {
  it('honours an explicit source and CurseForge ids', () => {
    expect(inferModSource(installed({ source: 'curseforge' }))).toBe('curseforge')
    expect(inferModSource(installed({ projectId: 'cf-1234' }))).toBe('curseforge')
    expect(inferModSource(installed())).toBe('modrinth')
  })

  it('never guesses a source for local or empty records', () => {
    expect(inferModSource(installed({ projectId: 'local:foo.jar' }))).toBeUndefined()
    expect(inferModSource(installed({ versionId: 'local' }))).toBeUndefined()
    expect(inferModSource(installed({ projectId: '' }))).toBeUndefined()
  })
})

describe('dependencyDiff', () => {
  it('reports only required dependencies that are added or removed', () => {
    const mod = installed({ dependencies: ['self', 'old'] })
    const latest = {
      dependencies: [
        { dependency_type: 'required', project_id: 'self', version_id: null },
        { dependency_type: 'required', project_id: 'new', version_id: null },
        { dependency_type: 'optional', project_id: 'optional', version_id: null }
      ]
    } as ModVersion

    expect(dependencyDiff(mod, latest)).toEqual({ added: ['new'], removed: ['old'] })
  })
})

describe('checkModUpdates', () => {
  it('returns an offline report without calling any provider', async () => {
    const { root, store } = setup([installed()])
    writeModJar(root, 'alpha-1.0.jar')
    setOffline(true)

    const report = await checkModUpdates(store, 'i1')

    expect(report.offline).toBe(true)
    expect(report.counts.unavailable).toBe(1)
    expect(report.entries[0].reason).toBe('离线模式已开启')
    expect(getModProject).not.toHaveBeenCalled()
  })

  it('marks local jars as unavailable without guessing a project id', async () => {
    const { root, store } = setup([])
    writeModJar(root, 'local-only.jar')

    const report = await checkModUpdates(store, 'i1')

    expect(report.entries).toHaveLength(1)
    expect(report.entries[0].projectId).toBe('local:local-only.jar')
    expect(report.entries[0].status).toBe('unavailable')
    expect(report.entries[0].reason).toContain('本地文件')
  })
})

describe('setModUpdatePreference', () => {
  it('persists pin, skip, unpin and unskip without network', async () => {
    const { root, state, store } = setup([installed()])
    writeModJar(root, 'alpha-1.0.jar')

    await setModUpdatePreference(store, 'i1', 'alpha', 'pin')
    expect(state.instance.mods[0].pinnedVersionId).toBe('v1')
    expect(getModProject).not.toHaveBeenCalled()

    await setModUpdatePreference(store, 'i1', 'alpha', 'skip', 'v2')
    expect(state.instance.mods[0].skippedVersionId).toBe('v2')

    await setModUpdatePreference(store, 'i1', 'alpha', 'unpin')
    await setModUpdatePreference(store, 'i1', 'alpha', 'unskip')
    expect(state.instance.mods[0].pinnedVersionId).toBeUndefined()
    expect(state.instance.mods[0].skippedVersionId).toBeUndefined()
  })
})

describe('updateInstalledMod', () => {
  it('restores the old jar and receipt when the install task fails', async () => {
    const mod = installed()
    const { root, state, store } = setup([mod])
    const oldJar = writeModJar(root, mod.fileName, 'old')
    vi.mocked(getModProject).mockResolvedValue({
      project: { project_id: 'alpha', title: 'Alpha' },
      versions: [
        {
          id: 'v2',
          project_id: 'alpha',
          name: 'Alpha 2.0',
          version_number: '2.0',
          version_type: 'release',
          game_versions: ['1.20.1'],
          loaders: ['fabric'],
          date_published: new Date().toISOString(),
          files: [
            {
              url: 'https://example.invalid/alpha-2.0.jar',
              filename: 'alpha-2.0.jar',
              primary: true,
              size: 1,
              hashes: { sha1: 'a', sha512: 'b' }
            }
          ],
          dependencies: []
        }
      ]
    } as never)
    vi.mocked(startModInstall).mockImplementation(async (options) => {
      const instance = options.store.getInstance(options.instanceId)
      if (!instance) throw new Error('missing instance')
      const dependency = installed({
        projectId: 'dep',
        title: 'Dependency',
        versionId: 'dep-v1',
        versionName: 'Dependency 1.0',
        fileName: 'dep-1.0.jar'
      })
      writeFileSync(join(options.store.instanceGamePath(instance), 'mods', dependency.fileName), 'dep')
      options.store.updateInstance(options.instanceId, (latest) => ({
        ...latest,
        mods: [...latest.mods, dependency]
      }))
      return { taskId: 't1' }
    })
    const tasks = {
      waitFor: vi.fn().mockRejectedValue(new Error('下载失败'))
    } as unknown as TaskManager

    const result = await updateInstalledMod(store, tasks, 'i1', 'alpha', () => undefined)

    expect(result).toMatchObject({ updated: false, rolledBack: true, projectId: 'alpha' })
    expect(vi.mocked(startModInstall)).toHaveBeenCalledWith(
      expect.objectContaining({ force: true, versionId: 'v2' })
    )
    expect(readFileSync(oldJar, 'utf8')).toBe('old')
    expect(state.instance.mods[0]).toMatchObject({ versionId: 'v1', fileName: 'alpha-1.0.jar' })
    expect(state.instance.mods.some((item) => item.projectId === 'dep')).toBe(false)
    expect(
      existsSync(join(root, 'instances', 'i1', '.minecraft', 'mods', 'dep-1.0.jar'))
    ).toBe(false)
    const backups = await listModBackups(store, 'i1')
    expect(backups[0]).toMatchObject({ status: 'rolled_back', projectId: 'alpha' })
  })
})

describe('rollbackModUpdate', () => {
  it('restores the backed-up jar, record and marks the receipt rolled back', async () => {
    const current = installed({ versionId: 'v2', versionName: '2.0', fileName: 'alpha-2.0.jar' })
    const { root, state, store } = setup([current])
    const newJar = writeModJar(root, 'alpha-2.0.jar', 'new')
    const oldJar = installed({ fileName: 'alpha-1.0.jar' })
    const backupId = 'backup-1'
    const backupDirectory = join(
      root,
      'instances',
      'i1',
      '.fangjie',
      'backups',
      'mods',
      backupId
    )
    mkdirSync(join(backupDirectory, 'files'), { recursive: true })
    writeFileSync(join(backupDirectory, 'files', oldJar.fileName), 'old')
    writeFileSync(
      join(backupDirectory, 'receipt.json'),
      JSON.stringify({
        id: backupId,
        projectId: current.projectId,
        title: current.title,
        fileName: oldJar.fileName,
        versionId: oldJar.versionId,
        versionName: oldJar.versionName,
        source: 'modrinth',
        createdAt: Date.now(),
        status: 'committed',
        record: oldJar
      })
    )

    const result = await rollbackModUpdate(store, 'i1', backupId)

    expect(result.backup.status).toBe('rolled_back')
    expect((result.backup as unknown as { record?: unknown }).record).toBeUndefined()
    expect(result.mods[0]).toMatchObject({ projectId: current.projectId, versionId: 'v1' })
    expect(existsSync(newJar)).toBe(false)
    expect(readFileSync(join(root, 'instances', 'i1', '.minecraft', 'mods', oldJar.fileName), 'utf8')).toBe('old')
    expect(state.instance.mods[0].fileName).toBe(oldJar.fileName)
    expect(JSON.parse(readFileSync(join(backupDirectory, 'receipt.json'), 'utf8')).status).toBe(
      'rolled_back'
    )
  })
})
