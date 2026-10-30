import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cachedJavaStatus, registerJavaRuntime } from './java'
import type { LauncherStore } from './store'

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpdir(),
    getVersion: () => '0.0.4'
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString()
  }
}))

const roots: string[] = []

function fakeStore(): { store: LauncherStore; root: string; javaPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'fangjie-java-'))
  roots.push(root)
  const javaPath = join(root, 'java.exe')
  writeFileSync(javaPath, 'fake java runtime', 'utf8')
  const store = {
    dataPath: root,
    minecraftPath: join(root, 'minecraft'),
    settings: { javaPath: '' }
  } as unknown as LauncherStore
  return { store, root, javaPath }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Java runtime cache', () => {
  it('registers a known downloaded runtime without probing and reads it from cache', () => {
    const { store, javaPath } = fakeStore()
    registerJavaRuntime(store, javaPath, 21, 'java-runtime-delta')
    const status = cachedJavaStatus(store)
    expect(status.fromCache).toBe(true)
    expect(status.runtimes).toHaveLength(1)
    expect(status.runtimes[0]).toMatchObject({
      path: javaPath,
      majorVersion: 21,
      version: 'Java 21',
      source: 'auto',
      component: 'java-runtime-delta'
    })
  })

  it('invalidates a cached runtime when the executable mtime changes', () => {
    const { store, javaPath } = fakeStore()
    registerJavaRuntime(store, javaPath, 17)
    expect(cachedJavaStatus(store).runtimes).toHaveLength(1)
    writeFileSync(javaPath, 'replaced java runtime with a newer mtime', 'utf8')
    const future = new Date(Date.now() + 5_000)
    utimesSync(javaPath, future, future)
    expect(cachedJavaStatus(store).runtimes).toHaveLength(0)
  })
})
