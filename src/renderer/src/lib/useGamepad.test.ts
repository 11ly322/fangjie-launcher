import { describe, expect, it } from 'vitest'
import { nextGamepadFocus } from './useGamepad'

describe('gamepad focus traversal', () => {
  const first = { id: 'first' } as HTMLElement
  const second = { id: 'second' } as HTMLElement
  const third = { id: 'third' } as HTMLElement
  const list = [first, second, third]

  it('moves forward and wraps', () => {
    expect(nextGamepadFocus(list, first, 'next')).toBe(second)
    expect(nextGamepadFocus(list, third, 'next')).toBe(first)
  })

  it('moves backward and starts from the end', () => {
    expect(nextGamepadFocus(list, first, 'prev')).toBe(third)
    expect(nextGamepadFocus(list, null, 'prev')).toBe(third)
    expect(nextGamepadFocus([], null, 'next')).toBeNull()
  })
})
