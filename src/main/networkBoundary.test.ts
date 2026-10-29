import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('main-process network boundary', () => {
  it('keeps direct fetch inside the download seam only', () => {
    const directory = __dirname
    const offenders: string[] = []
    for (const file of readdirSync(directory)) {
      if (!file.endsWith('.ts') || file.endsWith('.test.ts') || file === 'downloadSource.ts') continue
      const source = readFileSync(join(directory, file), 'utf8')
      if (/(?<![\w.])fetch\(/.test(source)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})
