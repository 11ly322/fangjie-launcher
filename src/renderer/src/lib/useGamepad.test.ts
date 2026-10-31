import { describe, expect, it } from 'vitest'
import { nextGamepadFocus, spatialGamepadFocus } from './useGamepad'

function box(id: string, left: number, top: number, width = 80, height = 32): HTMLElement {
  return {
    id,
    getBoundingClientRect: () => ({
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      x: left,
      y: top,
      toJSON: () => ({})
    })
  } as unknown as HTMLElement
}

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

  it('moves focus spatially in a grid', () => {
    const topLeft = box('top-left', 0, 0)
    const topRight = box('top-right', 120, 0)
    const bottomLeft = box('bottom-left', 0, 80)
    const bottomRight = box('bottom-right', 120, 80)
    const grid = [topLeft, topRight, bottomLeft, bottomRight]

    expect(spatialGamepadFocus(grid, topLeft, 'right')).toBe(topRight)
    expect(spatialGamepadFocus(grid, topLeft, 'down')).toBe(bottomLeft)
    expect(spatialGamepadFocus(grid, bottomRight, 'up')).toBe(topRight)
    expect(spatialGamepadFocus(grid, bottomLeft, 'right')).toBe(bottomRight)
  })
})
