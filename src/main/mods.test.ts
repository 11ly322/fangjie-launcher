import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Instance } from '../shared/types'
import type { LauncherStore } from './store'
import { listInstanceMods, modsIndexPath } from './mods'

const roots: string[] = []

function fixture(): { store: LauncherStore; instance: Instance; modsDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'fangjie-mods-index-'))
  roots.push(root)
  const instance: Instance = {
    id: 'perf',
    name: '性能测试',
    mcVersion: '1.20.1',
    loader: 'fabric',
    versionId: '1.20.1',
    icon: 'grass',
    accent: '#b8e85c',
    createdAt: Date.now(),
    totalPlayTimeMs: 0,
    mods: []
  }
  const modsDir = join(root, 'instances', instance.id, '.minecraft', 'mods')
  mkdirSync(modsDir, { recursive: true })
  const store = {
    instancesPath: join(root, 'instances'),
    instanceGamePath: () => join(root, 'instances', instance.id, '.minecraft'),
    getInstance: () => instance
  } as unknown as LauncherStore
  return { store, instance, modsDir }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('per-instance mods index', () => {
  it('writes an index and picks up new files incrementally', () => {
    const { store, instance, modsDir } = fixture()
    writeFileSync(join(modsDir, 'alpha.jar'), 'a')
    writeFileSync(join(modsDir, 'beta.jar.disabled'), 'b')
    expect(listInstanceMods(store, instance)).toHaveLength(2)
    const indexPath = modsIndexPath(store, instance)
    expect(existsSync(indexPath)).toBe(true)

    writeFileSync(join(modsDir, 'gamma.jar'), 'c')
    const mods = listInstanceMods(store, instance)
    expect(mods).toHaveLength(3)
    expect(mods.find((mod) => mod.fileName === 'beta.jar.disabled')?.enabled).toBe(false)
    const index = JSON.parse(readFileSync(indexPath, 'utf8')) as { files: Array<{ fileName: string }> }
    expect(index.files.map((file) => file.fileName).sort()).toEqual([
      'alpha.jar',
      'beta.jar.disabled',
      'gamma.jar'
    ])
  })

  it('rebuilds a corrupt index and overlays saved mod records', () => {
    const { store, instance, modsDir } = fixture()
    writeFileSync(join(modsDir, 'gamma.jar'), 'c')
    const indexPath = modsIndexPath(store, instance)
    mkdirSync(join(store.instancesPath, instance.id, '.fangjie'), { recursive: true })
    writeFileSync(indexPath, '{not json', 'utf8')
    instance.mods = [
      {
        projectId: 'gamma',
        slug: 'gamma',
        title: 'Gamma 模组',
        versionId: 'v1',
        versionName: '1.0',
        fileName: 'gamma.jar',
        enabled: true,
        installedAt: 1
      }
    ]
    const mods = listInstanceMods(store, instance)
    expect(mods).toHaveLength(1)
    expect(mods[0].title).toBe('Gamma 模组')
    expect(() => JSON.parse(readFileSync(indexPath, 'utf8'))).not.toThrow()
  })
})
