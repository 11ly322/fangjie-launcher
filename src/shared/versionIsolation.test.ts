import { describe, expect, it } from 'vitest'
import { isSnapshotVersion, shouldIsolateVersion } from './versionIsolation'

describe('version isolation policy', () => {
  it('recognises snapshot version names', () => {
    expect(isSnapshotVersion('1.20.1')).toBe(false)
    expect(isSnapshotVersion('24w14a')).toBe(true)
    expect(isSnapshotVersion('snapshot-24w14a')).toBe(true)
  })

  it('follows each global mode', () => {
    const modded = { loader: 'fabric' as const, mcVersion: '1.20.1' }
    const vanilla = { loader: 'vanilla' as const, mcVersion: '1.20.1' }
    const snapshot = { loader: 'vanilla' as const, mcVersion: '24w14a' }
    expect(shouldIsolateVersion('off', modded)).toBe(false)
    expect(shouldIsolateVersion('modded', modded)).toBe(true)
    expect(shouldIsolateVersion('modded', vanilla)).toBe(false)
    expect(shouldIsolateVersion('snapshot', snapshot)).toBe(true)
    expect(shouldIsolateVersion('snapshot', vanilla)).toBe(false)
    expect(shouldIsolateVersion('modded-snapshot', snapshot)).toBe(true)
    expect(shouldIsolateVersion('all', vanilla)).toBe(true)
  })
})
