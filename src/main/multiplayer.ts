import { app, BrowserWindow } from 'electron'
import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import { existsSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import type {
  MultiplayerState,
  StartGuestInput,
  StartHostInput
} from '../shared/types'

/**
 * EasyTier community relay nodes. They are shared public rendezvous/relay
 * endpoints used by the connector; the launcher never runs its own relay,
 * signaling server, TURN server, or VPN service.
 */
const COMMUNITY_RELAYS = [
  'tcp://183.66.27.22:39409',
  'tcp://cgk1.clusters.zeabur.com:22171',
  'tcp://tcp.ap-northeast-1.clawcloudrun.com:45146'
] as const

type ConnectorProcess = ChildProcessByStdio<null, Readable, Readable>

const CONNECTOR_EXE = 'qomicex-connector-cli.exe'
const ROOM_CODE_PATTERN = /^U\/([A-HJ-NP-Z0-9]{4})-([A-HJ-NP-Z0-9]{4})-([A-HJ-NP-Z0-9]{4})-([A-HJ-NP-Z0-9]{4})$/
const START_TIMEOUT_MS = 120_000

const IDLE_STATE: MultiplayerState = {
  active: false,
  phase: 'idle',
  players: 0
}

function emit(state: MultiplayerState): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('multiplayer:state', state)
  }
}

function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase()
}

function validatePlayerName(value: string): string {
  const name = value.trim()
  if (!name || name.length > 16 || /[\u0000-\u001f]/.test(name)) {
    throw new Error('玩家名需要是 1–16 个字符')
  }
  return name
}

function validateRoomCode(value: string): string {
  const code = normalizeRoomCode(value)
  if (!ROOM_CODE_PATTERN.test(code)) {
    throw new Error('房间码格式应为 U/XXXX-XXXX-XXXX-XXXX')
  }
  return code
}

class MultiplayerManager {
  private child: ConnectorProcess | null = null
  private state: MultiplayerState = { ...IDLE_STATE }
  private startTimer: NodeJS.Timeout | null = null
  private stopping = false

  getState(): MultiplayerState {
    return { ...this.state }
  }

  async startHost(input: StartHostInput): Promise<MultiplayerState> {
    const playerName = validatePlayerName(input.playerName)
    const mcPort = Number(input.mcPort)
    if (!Number.isInteger(mcPort) || mcPort < 1024 || mcPort > 65535) {
      throw new Error('Minecraft 局域网端口需要在 1024–65535 之间')
    }
    await this.stop()
    this.setState({
      active: true,
      role: 'host',
      phase: 'starting',
      players: 1,
      playerName,
      mcPort
    })
    try {
      const child = this.spawnConnector(['host', String(mcPort), playerName])
      this.attach(child, 'host')
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error))
      throw error
    }
    this.armStartTimeout('创建房间超时，请检查公共中继节点连接')
    return this.getState()
  }

  async startGuest(input: StartGuestInput): Promise<MultiplayerState> {
    const playerName = validatePlayerName(input.playerName)
    const roomCode = validateRoomCode(input.roomCode)
    await this.stop()
    this.setState({
      active: true,
      role: 'guest',
      phase: 'starting',
      players: 1,
      playerName,
      roomCode
    })
    try {
      const child = this.spawnConnector(['guest', roomCode, playerName])
      this.attach(child, 'guest')
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error))
      throw error
    }
    this.armStartTimeout('加入房间超时，请检查房间码和公共中继节点连接')
    return this.getState()
  }

  async stop(): Promise<MultiplayerState> {
    this.stopping = true
    this.clearStartTimer()
    const child = this.child
    this.child = null
    if (child && !child.killed) {
      child.kill()
    }
    this.stopping = false
    this.setState({ ...IDLE_STATE })
    return this.getState()
  }

  dispose(): void {
    this.clearStartTimer()
    const child = this.child
    this.child = null
    if (child && !child.killed) child.kill()
  }

  private spawnConnector(args: string[]): ConnectorProcess {
    const executable = this.resolveConnector()
    if (!executable) {
      throw new Error(
        '联机连接器未安装。请使用 0.0.1-beta 发布包，或先构建 native 连接器。'
      )
    }
    const relayArgs = COMMUNITY_RELAYS.flatMap((relay) => ['--relay', relay])
    const child = spawn(executable, [...relayArgs, ...args], {
      cwd: app.isPackaged ? process.resourcesPath : app.getAppPath(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        RUST_LOG: 'warn',
        NO_COLOR: '1'
      }
    })
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    const lines = createInterface({ input: child.stdout })
    lines.on('line', (line) => this.handleLine(line))
    child.stderr.on('data', (chunk: string) => {
      const message = String(chunk)
      if (/panicked at|thread '.*' panicked/i.test(message)) {
        this.fail('联机连接器崩溃')
      }
    })
    return child
  }

  private attach(child: ConnectorProcess, role: 'host' | 'guest'): void {
    this.child = child
    child.once('error', (error) => {
      this.fail(`联机连接器启动失败：${error.message}`)
    })
    child.once('close', (code) => {
      if (this.child !== child) return
      this.child = null
      if (this.stopping) return
      if (this.state.phase === 'ready' && code === 0) {
        this.setState({ ...IDLE_STATE })
      } else if (this.state.phase !== 'error') {
        this.fail(
          code && code !== 0
            ? `联机连接器已退出（代码 ${code}）`
            : '联机连接已关闭'
        )
      }
    })
    if (role === 'host') {
      this.setState({ ...this.state, role: 'host' })
    } else {
      this.setState({ ...this.state, role: 'guest' })
    }
  }

  private handleLine(rawLine: string): void {
    const line = rawLine.replace(/\u001b\[[0-9;]*m/g, '').trim()
    if (!line) return

    const room = line.match(/房间码[：:]\s*(U\/[A-HJ-NP-Z0-9-]+)/i)
    if (room) {
      this.clearStartTimer()
      this.setState({
        ...this.state,
        phase: 'ready',
        roomCode: normalizeRoomCode(room[1]),
        error: undefined
      })
      return
    }

    const address = line.match(/MC\s*服务器地址[：:]\s*([^\s]+)/i)
    if (address) {
      this.clearStartTimer()
      this.setState({
        ...this.state,
        phase: 'ready',
        address: address[1],
        error: undefined
      })
      return
    }

    const players = line.match(/玩家数[：:]\s*(\d+)/)
    if (players) {
      this.setState({ ...this.state, players: Number(players[1]) })
      return
    }

    const error = line.match(/^错误[：:]\s*(.+)$/)
    if (error) this.fail(error[1].trim())
  }

  private fail(message: string): void {
    this.clearStartTimer()
    const child = this.child
    this.child = null
    if (child && !child.killed) child.kill()
    this.setState({
      ...this.state,
      active: false,
      phase: 'error',
      error: message
    })
  }

  private armStartTimeout(message: string): void {
    this.clearStartTimer()
    this.startTimer = setTimeout(() => this.fail(message), START_TIMEOUT_MS)
  }

  private clearStartTimer(): void {
    if (this.startTimer) {
      clearTimeout(this.startTimer)
      this.startTimer = null
    }
  }

  private resolveConnector(): string | null {
    if (process.platform !== 'win32') return null
    const candidates = [
      app.isPackaged
        ? join(process.resourcesPath, 'bin', CONNECTOR_EXE)
        : join(app.getAppPath(), 'resources', 'bin', CONNECTOR_EXE),
      join(process.cwd(), 'resources', 'bin', CONNECTOR_EXE)
    ]
    return candidates.find((candidate) => existsSync(candidate)) || null
  }

  private setState(next: MultiplayerState): void {
    this.state = next
    emit({ ...next })
  }
}

export const multiplayerManager = new MultiplayerManager()
