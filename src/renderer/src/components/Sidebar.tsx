import {
  Boxes,
  ChevronRight,
  Download,
  Home,
  Puzzle,
  Settings,
  Sparkles,
  Users
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { Account, JavaStatus, TaskView } from '../../../shared/types'
import { PixelAvatar, SkinHead, BrandMark } from './Artwork'
import { Badge, StatusDot } from './ui'
import { classNames } from '../lib/format'
import type { PageName } from '../lib/navigation'

const NAV_ITEMS: Array<{
  page: PageName
  label: string
  icon: ReactNode
  hint?: string
}> = [
  { page: 'home', label: '首页', icon: <Home size={19} /> },
  { page: 'instances', label: '游戏实例', icon: <Boxes size={19} /> },
  { page: 'mods', label: '模组工坊', icon: <Puzzle size={19} /> },
  { page: 'multiplayer', label: '房间联机', icon: <Users size={19} /> },
  { page: 'downloads', label: '下载中心', icon: <Download size={19} /> }
]

export function Sidebar({
  page,
  onNavigate,
  account,
  tasks,
  java,
  appVersion,
  onAccountClick
}: {
  page: PageName
  onNavigate: (page: PageName) => void
  account: Account
  tasks: TaskView[]
  java: JavaStatus
  appVersion: string
  onAccountClick: () => void
}): React.JSX.Element {
  const activeTasks = tasks.filter((task) => task.status === 'running' || task.status === 'queued').length
  const javaRuntime = java.runtimes.find((runtime) => runtime.source === 'manual') || java.runtimes[0]
  const navPage = page === 'instance' ? 'instances' : page

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <BrandMark size={42} />
        <div>
          <div className="brand-name">UBL</div>
          <div className="brand-sub">unflod bindery launcher</div>
        </div>
      </div>

      <div className="sidebar__shelf" aria-hidden="true">
        <span /><span /><span /><span /><span />
      </div>

      <div className="sidebar__section-label">探索</div>
      <nav className="sidebar__nav" aria-label="主导航">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.page}
            type="button"
            className={classNames('nav-item', navPage === item.page && 'is-active')}
            onClick={() => onNavigate(item.page)}
            aria-current={navPage === item.page ? 'page' : undefined}
          >
            <span className="nav-item__icon">{item.icon}</span>
            <span>{item.label}</span>
            {item.page === 'downloads' && activeTasks > 0 ? (
              <Badge tone="accent" className="nav-item__badge">
                {activeTasks}
              </Badge>
            ) : null}
            {item.page !== 'downloads' && navPage === item.page ? (
              <span className="nav-item__indicator" />
            ) : null}
          </button>
        ))}
      </nav>

      <div className="sidebar__spacer" />

      <button
        type="button"
        className={classNames('nav-item', page === 'settings' && 'is-active')}
        onClick={() => onNavigate('settings')}
      >
        <span className="nav-item__icon">
          <Settings size={19} />
        </span>
        <span>设置</span>
        {page === 'settings' ? <span className="nav-item__indicator" /> : null}
      </button>

      <div className="sidebar__status">
        <span className="sidebar__status-icon">
          <Sparkles size={15} />
        </span>
        <div>
          <div className="sidebar__status-title">
            <StatusDot tone={javaRuntime ? 'success' : 'warn'} pulse={!javaRuntime} />
            {javaRuntime ? `Java ${javaRuntime.majorVersion}` : '等待 Java'}
          </div>
          <div className="sidebar__status-desc">
            {javaRuntime ? '运行环境已就绪' : '首次启动会自动下载'}
          </div>
        </div>
      </div>

      <button type="button" className="account-card" onClick={onAccountClick}>
        <span className="account-card__avatar">
          {account.type === 'offline' && account.skin?.dataUrl ? (
            <SkinHead dataUrl={account.skin.dataUrl} size={38} />
          ) : (
            <PixelAvatar name={account.name} size={38} />
          )}
          <span className="account-card__online" />
        </span>
        <span className="account-card__meta">
          <strong>{account.name}</strong>
          <span>{account.type === 'microsoft' ? 'Microsoft 正版' : '离线档案'}</span>
        </span>
        <ChevronRight size={16} className="account-card__chevron" />
      </button>

      <div className="sidebar__version">v{appVersion} · 非官方启动器</div>
    </aside>
  )
}
