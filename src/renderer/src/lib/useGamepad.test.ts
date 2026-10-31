import { describe, expect, it } from 'vitest'
import {
  nextEnabledOptionIndex,
  nextGamepadFocus,
  spatialGamepadFocus,
  stepRangeValue
} from './useGamepad'

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

describe('gamepad range and select control', () => {
  it('steps a range by its native step and clamps at both ends', () => {
    expect(stepRangeValue(4096, 1024, 16384, 512, 1)).toBe(4608)
    expect(stepRangeValue(4096, 1024, 16384, 512, -1)).toBe(3584)
    expect(stepRangeValue(1024, 1024, 16384, 512, -1)).toBe(1024)
    expect(stepRangeValue(16384, 1024, 16384, 512, 1)).toBe(16384)
  })

  it('falls back to sane values for an invalid range', () => {
    expect(stepRangeValue(Number.NaN, 0, 100, 0, 1)).toBe(1)
    expect(stepRangeValue(50, 0, 100, 10, 1)).toBe(60)
  })

  it('cycles select options while skipping disabled entries and wrapping', () => {
    const options = [{}, { disabled: true }, {}, {}]
    expect(nextEnabledOptionIndex(options, 0, 1)).toBe(2)
    expect(nextEnabledOptionIndex(options, 2, 1)).toBe(3)
    expect(nextEnabledOptionIndex(options, 3, 1)).toBe(0)
    expect(nextEnabledOptionIndex(options, 0, -1)).toBe(3)
    expect(nextEnabledOptionIndex([{ disabled: true }], 0, 1)).toBe(-1)
  })
})
