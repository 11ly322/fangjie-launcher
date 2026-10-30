import { describe, expect, it } from 'vitest'
import {
  hasChinese,
  translateModText,
  translateModTitle,
  translateSearchQuery
} from './modI18n'

describe('mod translation helpers', () => {
  it('detects Chinese text but not English', () => {
    expect(hasChinese('优化')).toBe(true)
    expect(hasChinese('Sodium')).toBe(false)
  })

  it('translates Chinese search aliases while keeping English terms', () => {
    const query = translateSearchQuery('机械动力 客户端优化')
    expect(query).toContain('create')
    expect(query).toContain('client')
    expect(query).toContain('optimization')
    expect(translateSearchQuery('Sodium 优化').toLowerCase()).toContain('sodium')
    expect(translateSearchQuery('Sodium')).toBe('Sodium')
  })

  it('translates curated project names and falls back to the original title', () => {
    expect(translateModTitle({ title: 'Sodium', slug: 'sodium' })).toBe('钠')
    expect(translateModTitle({ title: 'Create', project_id: 'create' })).toBe('机械动力')
    expect(translateModTitle({ title: "Create: Steam 'n' Rails" })).toBe("机械动力: Steam 'n' Rails")
    expect(translateModTitle({ title: 'Some Unknown Mod' })).toBe('Some Unknown Mod')
  })

  it('translates common English terms in descriptions', () => {
    const translated = translateModText('A performance mod with quality of life features.')
    expect(translated).toContain('性能')
    expect(translated).toContain('实用增强')
    expect(translated).toContain('功能')
    expect(translated).not.toContain('performance')
  })

  it('does not translate words inside identifiers or URLs', () => {
    const source = 'See https://example.com/performance for compatibility details.'
    const translated = translateModText(source)
    expect(translated).toContain('https://example.com/performance')
    expect(translated).toContain('兼容性')
    expect(translateModText('performances')).toBe('performances')
  })
})
