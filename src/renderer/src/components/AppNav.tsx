import {
  Boxes,
  Download,
  Gamepad2,
  Home,
  Loader2,
  Play,
  Power,
  Settings,
  Square,
  Users
} from 'lucide-react'
import type { Account, InstanceSummary, TaskView } from '../../../shared/types'
import type { PageName } from '../lib/navigation'
import { BrandMark, PixelAvatar, SkinHead } from './Artwork'
import { Badge, Button } from './ui'
import { classNames } from '../lib/format'

const TABS: Array<{ page: PageName; label: string; icon: React.ReactNode }> = [
  { page: 'home', label: '启动', icon: <Home size={16} /> },
  { page: 'downloads', label: '下载', icon: <Download size={16} /> },
  { page: 'multiplayer', label: '联机', icon: <Users size={16} /> },
  { page: 'settings', label: '设置', icon: <Settings size={16} /> }
]

function activeTab(page: PageName): PageName {
  if (page === 'instance' || page === 'instances') return 'home'
  if (page === 'mods') return 'downloads'
  return page
}

export function AppNav({
  page,
  onNavigate,
  account,
  tasks,
  activeInstance,
  running,
  launching,
  onLaunch,
  onOpenActive,
  onAccountClick,
  onExit,
  gamepadConnected
}: {
  page: PageName
  onNavigate: (page: PageName) => void
  account: Account
  tasks: TaskView[]
  activeInstance: InstanceSummary | null
  running: boolean
  launching: boolean
  onLaunch: () => void
  onOpenActive: () => void
  onAccountClick: () => void
  onExit: () => void
  gamepadConnected?: boolean
}): React.JSX.Element {
  const activeTasks = tasks.filter((task) => task.status === 'running' || task.status === 'queued').length
  const tab = activeTab(page)

  return (
    <header className="app-nav">
      <button type="button" className="app-nav__brand" onClick={() => onNavigate('home')} aria-label="返回启动页">
        <BrandMark size={34} />
        <span className="app-nav__brand-copy">
          <strong>UBL</strong>
          <small>unflod bindery launcher</small>
        </span>
      </button>

      <nav className="app-nav__tabs" aria-label="主导航">
        {TABS.map((item) => (
          <button
            key={item.page}
            type="button"
            className={classNames('app-nav__tab', tab === item.page && 'is-active')}
            onClick={() => onNavigate(item.page)}
            aria-current={tab === item.page ? 'page' : undefined}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.page === 'downloads' && activeTasks > 0 ? (
              <Badge tone="accent" className="app-nav__count">
                {activeTasks}
              </Badge>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="app-nav__right">
        <button
          type="button"
          className="app-nav__version"
          onClick={onOpenActive}
          disabled={!activeInstance}
          title={activeInstance ? `${activeInstance.name} · 版本详情` : '还没有选择版本'}
        >
          <Boxes size={15} />
          <span>
            <strong>{activeInstance?.name || '未选择版本'}</strong>
            <small>
              {activeInstance
                ? `Minecraft ${activeInstance.mcVersion} · ${
                    activeInstance.loader === 'vanilla' ? '原版' : activeInstance.loader
                  }`
                : '从启动页选择一个版本'}
            </small>
          </span>
        </button>
        <Button
          variant={running ? 'danger' : 'primary'}
          size="sm"
          className="app-nav__launch"
          disabled={!activeInstance}
          loading={launching}
          icon={
            running ? (
              <Square size={12} fill="currentColor" />
            ) : launching ? (
              <Loader2 size={13} className="spin" />
            ) : (
              <Play size={13} fill="currentColor" />
            )
          }
          onClick={onLaunch}
        >
          {running ? '结束' : launching ? '启动中' : '启动'}
        </Button>
        <button type="button" className="app-nav__account" onClick={onAccountClick}>
          {account.type === 'offline' && account.skin?.dataUrl ? (
            <SkinHead dataUrl={account.skin.dataUrl} size={30} />
          ) : (
            <PixelAvatar name={account.name} size={30} />
          )}
          <span>{account.name}</span>
        </button>
        {gamepadConnected ? (
          <span
            className="app-nav__gamepad"
            title="手柄已连接 · 方向键切换 · A 选择 · B 返回"
            aria-label="手柄已连接，方向键切换，A 选择，B 返回"
          >
            <Gamepad2 size={15} />
            <span>手柄</span>
          </span>
        ) : null}
        <button
          type="button"
          className="app-nav__exit"
          onClick={onExit}
          aria-label="退出启动器"
          title="退出启动器"
        >
          <Power size={16} />
        </button>
      </div>
    </header>
  )
}
