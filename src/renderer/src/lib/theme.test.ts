import { describe, expect, it } from 'vitest'
import { THEMES } from './theme'

describe('theme catalog', () => {
  it('exposes exactly the three supported themes', () => {
    expect(THEMES.map((theme) => theme.id)).toEqual(['moss', 'ocean', 'ember'])
    expect(new Set(THEMES.map((theme) => theme.accent)).size).toBe(3)
  })
})
