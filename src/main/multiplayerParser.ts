export type ConnectorEvent =
  | { kind: 'room'; roomCode: string }
  | { kind: 'address'; address: string; path: 'direct' | 'relay' }
  | { kind: 'players'; players: number }
  | { kind: 'error'; message: string }

/**
 * Parse the connector's human-readable stdout. Kept free of Electron imports
 * so direct/relay address behavior can be regression-tested.
 */
export function parseConnectorLine(rawLine: string): ConnectorEvent | null {
  const line = rawLine.replace(/\u001b\[[0-9;]*m/g, '').trim()
  if (!line) return null

  const room = line.match(/房间码[：:]\s*(U\/[A-HJ-NP-Z0-9-]+)/i)
  if (room) return { kind: 'room', roomCode: room[1].toUpperCase() }

  const direct = line.match(/直连模式[，,]\s*MC\s*地址[：:]\s*([^\s]+)/i)
  if (direct) return { kind: 'address', address: direct[1], path: 'direct' }

  const relay = line.match(/MC\s*服务器地址[：:]\s*([^\s]+)/i)
  if (relay) return { kind: 'address', address: relay[1], path: 'relay' }

  const players = line.match(/玩家数[：:]\s*(\d+)/)
  if (players) return { kind: 'players', players: Number(players[1]) }

  const error = line.match(/^错误[：:]\s*(.+)$/)
  if (error) return { kind: 'error', message: error[1].trim() }
  return null
}

export function parseHostPort(value: string): { host: string; port: number } | null {
  const trimmed = value.trim()
  const ipv6 = trimmed.match(/^\[([^\]]+)\]:(\d+)$/)
  const normal = trimmed.match(/^([^:]+):(\d+)$/)
  const match = ipv6 || normal
  if (!match) return null
  const port = Number(match[2])
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null
  return { host: match[1], port }
}
