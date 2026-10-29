import { Copy, DoorOpen, LogIn, Network, Play, Radio, ShieldCheck, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MultiplayerState } from '../../../shared/types'
import { useLauncher } from '../state/LauncherContext'
import { Badge, Button, Field, InlineNotice, Spinner, TextInput } from '../components/ui'
import { classNames } from '../lib/format'

type MultiplayerTab = 'host' | 'guest'

const EMPTY_STATE: MultiplayerState = {
  active: false,
  phase: 'idle',
  players: 0
}

const RELAY_LABELS = [
  '183.66.27.22:39409',
  'cgk1.clusters.zeabur.com:22171',
  'tcp.ap-northeast-1.clawcloudrun.com:45146'
]

function formatRoomCode(value: string): string {
  const body = value
    .replace(/^U\//i, '')
    .replace(/[^0-9A-Za-z]/g, '')
    .toUpperCase()
    .slice(0, 16)
  if (!body) return ''
  return `U/${body.match(/.{1,4}/g)?.join('-') || body}`
}

function isRoomCode(value: string): boolean {
  return /^U\/[A-HJ-NP-Z0-9]{4}-[A-HJ-NP-Z0-9]{4}-[A-HJ-NP-Z0-9]{4}-[A-HJ-NP-Z0-9]{4}$/.test(
    value
  )
}

export function MultiplayerPage(): React.JSX.Element {
  const { boot, toast } = useLauncher()
  const [tab, setTab] = useState<MultiplayerTab>('host')
  const [playerName, setPlayerName] = useState(boot.account.name)
  const [mcPort, setMcPort] = useState('25565')
  const [roomCode, setRoomCode] = useState('')
  const [state, setState] = useState<MultiplayerState>(EMPTY_STATE)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    void window.fangjie.multiplayerState().then((result) => {
      if (alive && result.ok) setState(result.value)
    })
    const unsubscribe = window.fangjie.onMultiplayerState((next) => {
      setState(next)
      if (next.role) setTab(next.role)
    })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  const activeRole = state.active && state.role ? state.role : tab
  const error = state.phase === 'error' ? state.error : undefined
  const portNumber = Number(mcPort)
  const canHost =
    playerName.trim().length > 0 &&
    Number.isInteger(portNumber) &&
    portNumber >= 1024 &&
    portNumber <= 65535
  const canJoin = isRoomCode(roomCode) && playerName.trim().length > 0

  const copy = async (value: string): Promise<void> => {
    const result = await window.fangjie.copyText(value)
    toast(result.ok ? '已复制到剪贴板' : result.error, result.ok ? 'success' : 'error')
  }

  const startHost = async (): Promise<void> => {
    if (!canHost || busy) return
    setBusy(true)
    const result = await window.fangjie.startHost({
      playerName: playerName.trim(),
      mcPort: portNumber
    })
    setBusy(false)
    if (!result.ok) {
      toast(result.error, 'error')
      return
    }
    setState(result.value)
    setTab('host')
  }

  const startGuest = async (): Promise<void> => {
    if (!canJoin || busy) return
    setBusy(true)
    const result = await window.fangjie.startGuest({
      playerName: playerName.trim(),
      roomCode
    })
    setBusy(false)
    if (!result.ok) {
      toast(result.error, 'error')
      return
    }
    setState(result.value)
    setTab('guest')
  }

  const stop = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    const result = await window.fangjie.stopMultiplayer()
    setBusy(false)
    if (!result.ok) {
      toast(result.error, 'error')
      return
    }
    setState(result.value)
  }

  return (
    <div className="page multiplayer-page">
      <header className="page-header multiplayer-header">
        <div>
          <div className="eyebrow">ROOM LINK</div>
          <h1>房间联机</h1>
          <p>一个房间码，让朋友直接连进你的 Minecraft 世界。无需公网 IP，也无需管理员权限。</p>
        </div>
        <div className="multiplayer-header__badges">
          <Badge tone="accent">
            <ShieldCheck size={13} /> 无需管理员
          </Badge>
          <Badge tone="outline">
            <Network size={13} /> 社区公共节点
          </Badge>
        </div>
      </header>

      <div className="multiplayer-layout">
        <section className="panel multiplayer-panel">
          {state.active ? (
            <div className="multiplayer-session">
              <div className="multiplayer-session__head">
                <div className={classNames('multiplayer-role-icon', `is-${activeRole}`)}>
                  {activeRole === 'host' ? <Radio size={22} /> : <LogIn size={22} />}
                </div>
                <div>
                  <div className="panel__eyebrow">
                    {activeRole === 'host' ? 'HOSTING' : 'CONNECTED'}
                  </div>
                  <h2>{activeRole === 'host' ? '房间已创建' : '正在加入房间'}</h2>
                </div>
                <Badge tone={state.phase === 'ready' ? 'success' : 'warn'}>
                  {state.phase === 'ready' ? '已就绪' : '正在建立连接'}
                </Badge>
              </div>

              {state.phase === 'starting' ? (
                <div className="multiplayer-wait">
                  <Spinner size={26} />
                  <div>
                    <strong>正在通过 EasyTier 公共节点建立虚拟网络</strong>
                    <p>首次加入可能需要几十秒，请保持启动器运行。</p>
                  </div>
                </div>
              ) : activeRole === 'host' ? (
                <>
                  <div className="multiplayer-code-block">
                    <span>把房间码发给朋友</span>
                    <div className="multiplayer-code-row">
                      <code>{state.roomCode || '等待连接器返回…'}</code>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Copy size={14} />}
                        disabled={!state.roomCode}
                        onClick={() => state.roomCode && void copy(state.roomCode)}
                      >
                        复制
                      </Button>
                    </div>
                  </div>
                  <div className="multiplayer-meta-row">
                    <span>
                      <Users size={15} /> {state.players || 1} 位玩家
                    </span>
                    <span>局域网端口 {state.mcPort || portNumber}</span>
                  </div>
                  <InlineNotice tone="info" title="房主操作">
                    请先在 Minecraft 中「对局域网开放」，再把游戏聊天栏显示的端口填入创建房间。
                    好友加入后，在多人游戏中粘贴房间码对应的地址即可。
                  </InlineNotice>
                </>
              ) : (
                <>
                  <div className="multiplayer-code-block">
                    <span>在 Minecraft 多人游戏中连接</span>
                    <div className="multiplayer-code-row">
                      <code>{state.address || '等待连接器返回地址…'}</code>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Copy size={14} />}
                        disabled={!state.address}
                        onClick={() => state.address && void copy(state.address)}
                      >
                        复制地址
                      </Button>
                    </div>
                  </div>
                  <div className="multiplayer-meta-row">
                    <span>
                      <Users size={15} /> 房间 {state.roomCode || roomCode}
                    </span>
                    <span>地址可直接粘贴到多人游戏</span>
                  </div>
                  <InlineNotice tone="success" title="连接已建立">
                    打开 Minecraft → 多人游戏 → 直接连接，粘贴上方地址。若房主关闭房间或网络断开，
                    该地址会失效。
                  </InlineNotice>
                </>
              )}

              <div className="multiplayer-actions">
                <Button
                  variant="ghost"
                  icon={<DoorOpen size={15} />}
                  loading={busy}
                  onClick={() => void stop()}
                >
                  {activeRole === 'host' ? '关闭房间' : '离开房间'}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="segmented multiplayer-tabs">
                <button
                  type="button"
                  className={classNames('segmented__item', tab === 'host' && 'is-active')}
                  onClick={() => setTab('host')}
                >
                  <Radio size={16} /> 创建房间
                </button>
                <button
                  type="button"
                  className={classNames('segmented__item', tab === 'guest' && 'is-active')}
                  onClick={() => setTab('guest')}
                >
                  <LogIn size={16} /> 加入房间
                </button>
              </div>

              {error ? (
                <InlineNotice tone="danger" title="联机连接失败">
                  {error}
                </InlineNotice>
              ) : null}

              {tab === 'host' ? (
                <form
                  className="multiplayer-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void startHost()
                  }}
                >
                  <div className="multiplayer-form__intro">
                    <h2>创建房间</h2>
                    <p>
                      先在 Minecraft 中打开「对局域网开放」，然后填写聊天栏显示的端口。
                      启动器会在虚拟网络内登记房主并生成房间码。
                    </p>
                  </div>
                  <Field label="玩家名" hint="会显示在联机玩家列表中">
                    <TextInput
                      value={playerName}
                      maxLength={16}
                      onChange={(event) => setPlayerName(event.target.value)}
                      placeholder="Steve"
                    />
                  </Field>
                  <Field label="Minecraft 局域网端口" hint="Minecraft 开放局域网后聊天栏显示的数字">
                    <TextInput
                      value={mcPort}
                      inputMode="numeric"
                      onChange={(event) => setMcPort(event.target.value.replace(/\D/g, ''))}
                      placeholder="25565"
                    />
                  </Field>
                  <div className="multiplayer-form__actions">
                    <Button
                      type="submit"
                      variant="primary"
                      icon={<Play size={16} />}
                      loading={busy}
                      disabled={!canHost}
                    >
                      创建房间
                    </Button>
                    <span>不需要开放路由器端口</span>
                  </div>
                </form>
              ) : (
                <form
                  className="multiplayer-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void startGuest()
                  }}
                >
                  <div className="multiplayer-form__intro">
                    <h2>加入房间</h2>
                    <p>
                      输入房主发来的房间码。连接成功后，启动器会给出一段可直接粘贴进 Minecraft
                      多人游戏的地址。
                    </p>
                  </div>
                  <Field label="房间码" hint="格式：U/XXXX-XXXX-XXXX-XXXX">
                    <TextInput
                      className="mono"
                      value={roomCode}
                      onChange={(event) => setRoomCode(formatRoomCode(event.target.value))}
                      placeholder="U/XXXX-XXXX-XXXX-XXXX"
                      spellCheck={false}
                      autoCapitalize="characters"
                    />
                  </Field>
                  <Field label="玩家名" hint="会显示在联机玩家列表中">
                    <TextInput
                      value={playerName}
                      maxLength={16}
                      onChange={(event) => setPlayerName(event.target.value)}
                      placeholder="Alex"
                    />
                  </Field>
                  <div className="multiplayer-form__actions">
                    <Button
                      type="submit"
                      variant="primary"
                      icon={<LogIn size={16} />}
                      loading={busy}
                      disabled={!canJoin}
                    >
                      加入房间
                    </Button>
                    <span>无需安装 VPN 软件</span>
                  </div>
                </form>
              )}
            </>
          )}
        </section>

        <aside className="multiplayer-side">
          <section className="panel multiplayer-info-card">
            <div className="panel__eyebrow">HOW IT WORKS</div>
            <h3>房间码怎么工作</h3>
            <ol className="multiplayer-steps">
              <li>
                <span>01</span>
                房主在 Minecraft 中开放局域网，启动器创建一个虚拟网络房间。
              </li>
              <li>
                <span>02</span>
                房客输入房间码，通过 EasyTier 公共节点发现房主。
              </li>
              <li>
                <span>03</span>
                启动器协商 SCF 协议并把可连接地址交给 Minecraft。
              </li>
            </ol>
          </section>

          <section className="panel multiplayer-info-card">
            <div className="panel__eyebrow">COMMUNITY RELAYS</div>
            <h3>公共中继节点</h3>
            <p>
              连接复用 EasyTier 社区公共节点，启动器不运营中转或信令服务器。节点不可达时会尝试
              下一个节点。
            </p>
            <div className="relay-list">
              {RELAY_LABELS.map((host) => (
                <span key={host}>
                  <Network size={13} /> {host}
                </span>
              ))}
            </div>
          </section>

          <section className="panel multiplayer-info-card multiplayer-info-card--muted">
            <ShieldCheck size={18} />
            <div>
              <strong>不需要管理员权限</strong>
              <p>
                联机连接器使用用户态网络栈，不会创建 TUN 网卡，也不会安装额外 VPN 驱动。
              </p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
