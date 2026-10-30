import { afterEach, describe, expect, it } from 'vitest'
import { configureNetworkConcurrency, networkConcurrency, withNetworkSlot } from './networkQueue'

afterEach(() => {
  configureNetworkConcurrency(8)
})

describe('network queue', () => {
  it('serializes network work when configured to one slot', async () => {
    configureNetworkConcurrency(1)
    let active = 0
    let peak = 0
    const order: number[] = []

    const task = (id: number): Promise<void> =>
      withNetworkSlot(async () => {
        active += 1
        peak = Math.max(peak, active)
        order.push(id)
        await new Promise((resolve) => setTimeout(resolve, 10))
        active -= 1
      })

    await Promise.all([task(1), task(2), task(3)])

    expect(peak).toBe(1)
    expect(order).toEqual([1, 2, 3])
  })

  it('clamps configured values to a bounded pool', () => {
    configureNetworkConcurrency(0)
    expect(networkConcurrency()).toBe(1)
    configureNetworkConcurrency(999)
    expect(networkConcurrency()).toBe(64)
    configureNetworkConcurrency(Number.NaN)
    expect(networkConcurrency()).toBe(8)
  })
})
