import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { latestOptiFineProfile } from './optifineProfile'

const directories: string[] = []
afterEach(() => {
  while (directories.length) rmSync(directories.pop() as string, { recursive: true, force: true })
})

describe('OptiFine profile discovery', () => {
  it('finds only matching OptiFine profiles', () => {
    const root = mkdtempSync(join(tmpdir(), 'fangjie-optifine-profile-'))
    directories.push(root)
    for (const id of ['1.20.1-OptiFine_HD_U_I6', '1.21-OptiFine_HD_U_J1', '1.20.1-forge']) {
      const dir = join(root, id)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, id + '.json'), JSON.stringify({ id }))
    }
    expect(latestOptiFineProfile(root, '1.20.1')).toBe('1.20.1-OptiFine_HD_U_I6')
  })

  it('returns null when no profile matches', () => {
    const root = mkdtempSync(join(tmpdir(), 'fangjie-optifine-profile-'))
    directories.push(root)
    expect(latestOptiFineProfile(root, '1.20.1')).toBeNull()
  })
})
