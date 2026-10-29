import { describe, expect, it } from 'vitest'
import { parseConnectorLine } from './multiplayerParser'

describe('connector output parsing', () => {
  it('parses room codes', () => {
    expect(parseConnectorLine('房间码: U/ABCD-EFGH-JKLM-NPQR')).toEqual({
      kind: 'room',
      roomCode: 'U/ABCD-EFGH-JKLM-NPQR'
    })
  })

  it('distinguishes direct and relay addresses', () => {
    expect(parseConnectorLine('直连模式，MC 地址: 10.0.0.2:25565')).toEqual({
      kind: 'address',
      address: '10.0.0.2:25565',
      path: 'direct'
    })
    expect(parseConnectorLine('MC 服务器地址: 127.0.0.1:25565')).toEqual({
      kind: 'address',
      address: '127.0.0.1:25565',
      path: 'relay'
    })
  })

  it('parses players and errors', () => {
    expect(parseConnectorLine('玩家数: 2')).toEqual({ kind: 'players', players: 2 })
    expect(parseConnectorLine('错误: 房间码无效')).toEqual({
      kind: 'error',
      message: '房间码无效'
    })
  })
})
