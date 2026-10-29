import { describe, expect, it } from 'vitest'
import { formatRoomCode, isRoomCode } from './room'

describe('room code helpers', () => {
  it('formats pasted text into groups', () => {
    expect(formatRoomCode('u/ab12cd34ef56ab78')).toBe('U/AB12-CD34-EF56-AB78')
    expect(formatRoomCode('')).toBe('')
  })

  it('validates complete room codes and excludes ambiguous characters', () => {
    expect(isRoomCode('U/ABCD-EFGH-JKLM-NPQR')).toBe(true)
    expect(isRoomCode('U/ABCI-EFGH-JKLM-NPQR')).toBe(false)
    expect(isRoomCode('ABCD-EFGH-JKLM-NPQR')).toBe(false)
  })
})
