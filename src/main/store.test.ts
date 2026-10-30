import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

vi.mock('electron', () => ({
  app: { getPath: () => join(tmpdir(), 'ubl-store-test-fallback') },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString()
  }
}))

import { LauncherStore } from './store'

let home = ''

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'ubl-store-test-'))
  process.env.FJ_HOME = home
})

afterEach(() => {
  delete process.env.FJ_HOME
  if (home) rmSync(home, { recursive: true, force: true })
})

function createInstance(store: LauncherStore, versionIsolation: boolean) {
  return store.createInstanceRecord({
    name: '隔离测试',
    mcVersion: '1.20.1',
    loader: 'fabric',
    versionId: '1.20.1',
    accent: '#b8e85c',
    icon: 'trees',
    memoryMb: 4096,
    versionIsolation
  })
}

describe('LauncherStore version isolation', () => {
  it('defaults a new instance to isolated storage with advanced defaults', () => {
    const store = new LauncherStore()
    const instance = createInstance(store, true)

    expect(instance.versionIsolation).toBe(true)
    expect(store.instanceGamePath(instance)).toBe(
      join(store.instancesPath, instance.id, '.minecraft')
    )
    expect(instance.gameArgs).toEqual([])
    expect(instance.memoryPreset).toBe('balanced')
    expect(instance.highPerformanceGpu).toBe(false)
  })

  it('uses the shared minecraft path when isolation is disabled', () => {
    const store = new LauncherStore()
    const instance = createInstance(store, false)

    expect(instance.versionIsolation).toBe(false)
    expect(store.instanceGamePath(instance)).toBe(store.minecraftPath)
    expect(store.instanceGamePath(instance)).not.toContain(join('instances', instance.id))
  })
})
