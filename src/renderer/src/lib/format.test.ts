import { describe, expect, it } from 'vitest'
import {
  clamp,
  formatCompactNumber,
  formatDate,
  formatPlaytime,
  rangeProgress,
  stripMarkdown
} from './format'

describe('format helpers', () => {
  it('formats Chinese compact counts', () => {
    expect(formatCompactNumber(999)).toBe('999')
    expect(formatCompactNumber(12_000)).toBe('1.2万')
    expect(formatCompactNumber(150_000_000)).toBe('1.5亿')
  })

  it('formats play time', () => {
    expect(formatPlaytime(0)).toBe('尚未游玩')
    expect(formatPlaytime(60_000 * 75)).toBe('1 小时 15 分钟')
  })

  it('computes range progress and clamps out-of-range values', () => {
    expect(rangeProgress(2048, 1024, 4096)).toBe('33.33333333333333%')
    expect(rangeProgress(0, 1024, 4096)).toBe('0%')
    expect(rangeProgress(99999, 1024, 4096)).toBe('100%')
    expect(clamp(5, 1, 3)).toBe(3)
  })

  it('strips common markdown safely as plain text', () => {
    expect(stripMarkdown('# 标题\n\n**加粗** [链接](https://example.com) ![图](x.png)')).toContain(
      '标题'
    )
    expect(stripMarkdown('[链接](https://example.com)')).toBe('链接')
  })

  it('does not crash on invalid dates', () => {
    expect(formatDate('not-a-date')).toBe('未知')
  })
})
