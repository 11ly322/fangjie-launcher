import { beforeEach, describe, expect, it } from 'vitest'
import { assertOnline, isOffline, setOffline } from './networkPolicy'

describe('offline network policy', () => {
  beforeEach(() => setOffline(false))

  it('blocks network actions while offline', () => {
    setOffline(true)
    expect(isOffline()).toBe(true)
    expect(() => assertOnline('下载模组')).toThrow('离线模式已开启')
  })

  it('allows network actions after disabling offline mode', () => {
    setOffline(true)
    setOffline(false)
    expect(isOffline()).toBe(false)
    expect(() => assertOnline('下载模组')).not.toThrow()
  })
})
