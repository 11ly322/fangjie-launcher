import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Instance, LoaderType } from '../shared/types'
import type { LauncherStore } from './store'

const mocks = vi.hoisted(() => ({
  installModLoader: vi.fn(),
  isGameRunning: vi.fn(),
  isOffline: vi.fn(),
  parse: vi.fn(),
  scanJavaRuntimes: vi.fn()
}))

vi.mock('./loaders', () => ({ installModLoader: mocks.installModLoader }))
vi.mock('./minecraft', () => ({ isGameRunning: mocks.isGameRunning }))
vi.mock('./networkPolicy', () => ({ isOffline: mocks.isOffline }))
vi.mock('./java', () => ({
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  normalizeJavaPath: (value: string) => value.trim(),
  requiredJavaMajor: () => 17,
  scanJavaRuntimes: mocks.scanJavaRuntimes
}))
vi.mock('@xmcl/core', () => ({ Version: { parse: mocks.parse } }))

import { setInstanceLoader } from './instanceLoader'

function fixture(loader: LoaderType = 'fabric'): {
  store: LauncherStore
  current: () => Instance
} {
  let instance: Instance = {
    id: 'loader-test',
    name: 'Loader Test',
    mcVersion: '1.20.1',
    loader,
    loaderVersion: loader === 'vanilla' ? undefined : '0.16.9',
    versionId: loader === 'vanilla' ? '1.20.1' : 'fabric-loader-0.16.9-1.20.1',
    icon: 'grass',
    accent: '#b8e85c',
    createdAt: Date.now(),
    totalPlayTimeMs: 0,
    mods: []
  }
  const store = {
    minecraftPath: 'C:/minecraft',
    getInstance: (id: string) => (id === instance.id ? instance : undefined),
    updateInstance: (id: string, update: (current: Instance) => Instance) => {
      if (id !== instance.id) throw new Error('missing')
      instance = update(instance)
      return instance
    }
  } as unknown as LauncherStore
  return { store, current: () => instance }
}

describe('setInstanceLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('installs a loader and updates the instance version', async () => {
    mocks.isGameRunning.mockReturnValue(false)
    mocks.isOffline.mockReturnValue(false)
    mocks.parse.mockResolvedValue({ javaVersion: { majorVersion: 17 } })
    mocks.scanJavaRuntimes.mockResolvedValue({
      configuredPath: '',
      runtimes: [{ path: 'C:/java/bin/java.exe', majorVersion: 17, source: 'auto' }]
    })
    mocks.installModLoader.mockResolvedValue({
      versionId: 'fabric-loader-0.16.10-1.20.1',
      loaderVersion: '0.16.10'
    })

    const { store, current } = fixture('vanilla')
    const result = await setInstanceLoader(store, 'loader-test', 'fabric')

    expect(mocks.installModLoader).toHaveBeenCalledWith(
      expect.objectContaining({
        mcPath: 'C:/minecraft',
        mcVersion: '1.20.1',
        loader: 'fabric',
        javaPath: 'C:/java/bin/java.exe'
      })
    )
    expect(result.loader).toBe('fabric')
    expect(result.loaderVersion).toBe('0.16.10')
    expect(result.versionId).toBe('fabric-loader-0.16.10-1.20.1')
    expect(current().versionId).toBe('fabric-loader-0.16.10-1.20.1')
  })

  it('switches back to vanilla without deleting files', async () => {
    mocks.isGameRunning.mockReturnValue(false)
    mocks.isOffline.mockReturnValue(false)
    mocks.parse.mockResolvedValue({ javaVersion: { majorVersion: 17 } })

    const { store, current } = fixture('fabric')
    const result = await setInstanceLoader(store, 'loader-test', 'vanilla')

    expect(mocks.installModLoader).not.toHaveBeenCalled()
    expect(result.loader).toBe('vanilla')
    expect(result.loaderVersion).toBeUndefined()
    expect(result.versionId).toBe('1.20.1')
    expect(current().versionId).toBe('1.20.1')
  })

  it('returns unchanged when the loader is already selected', async () => {
    const { store } = fixture('fabric')
    const result = await setInstanceLoader(store, 'loader-test', 'fabric')
    expect(result.loader).toBe('fabric')
    expect(mocks.installModLoader).not.toHaveBeenCalled()
  })

  it('rejects while the instance is running', async () => {
    mocks.isGameRunning.mockReturnValue(true)
    const { store } = fixture('fabric')
    await expect(setInstanceLoader(store, 'loader-test', 'vanilla')).rejects.toThrow('请先结束正在运行的游戏')
  })

  it('rejects loader installation while offline', async () => {
    mocks.isGameRunning.mockReturnValue(false)
    mocks.isOffline.mockReturnValue(true)
    const { store } = fixture('vanilla')
    await expect(setInstanceLoader(store, 'loader-test', 'fabric')).rejects.toThrow('离线模式已开启')
  })
})
