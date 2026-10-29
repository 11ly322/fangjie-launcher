import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Cpu,
  Download,
  FolderOpen,
  HardDrive,
  Play,
  Plus,
  Puzzle,
  RefreshCw,
  Sparkles,
  Square
} from 'lucide-react'
import type { ModSearchHit, TaskView } from '../../../shared/types'
import { useLauncher } from '../state/LauncherContext'
import { LOADER_LABEL } from '../../../shared/constants'
import { WorldArt, InstanceEmblem, PixelAvatar, SkinHead } from '../components/Artwork'
import { InstanceCard } from '../components/InstanceCard'
import { Badge, Button, InlineNotice, ProgressBar, SectionHeading, Skeleton, StatusDot } from '../components/ui'
import {
  formatCompactNumber,
  formatPlaytime,
  formatRelative,
  greeting,
  todayLabel
} from '../lib/format'
import { categoryLabel } from '../components/ModCard'

export function HomePage(): React.JSX.Element {
  const {
    boot,
    tasks,
    running,
    launching,
    activeInstance,
    navigate,
    openInstance,
    openMods,
    openCreateInstance,
    launch,
    toast
  } = useLauncher()

  const activeTask = tasks.find((task) => task.status === 'running' || task.status === 'queued')
  const recent = [...boot.instances]
    .sort((left, right) => (right.lastPlayedAt || right.createdAt) - (left.lastPlayedAt || left.createdAt))
    .slice(0, 3)
  const javaRuntime = boot.java.runtimes.find((runtime) => runtime.source === 'manual') || boot.java.runtimes[0]
  const activeRunning = activeInstance ? running.has(activeInstance.id) : false
  const activeLaunching = activeInstance ? launching.has(activeInstance.id) : false

  const openData = async (): Promise<void> => {
    const result = await window.fangjie.openDataFolder()
    if (!result.ok) toast(result.error, 'error')
  }

  return (
    <div className="page page--home">
      <header className="welcome">
        <div>
          <div className="eyebrow">{todayLabel()}</div>
          <h1>
            {greeting()}，<span>{boot.account.name}</span>
          </h1>
          <p>世界还在等你。选一个实例，继续上次的冒险。</p>
        </div>
        <div className="welcome__actions">
          <Button variant="secondary" icon={<Plus size={16} />} onClick={openCreateInstance}>
            新建实例
          </Button>
          {boot.account.type === 'offline' && boot.account.skin?.dataUrl ? (
            <SkinHead
              dataUrl={boot.account.skin.dataUrl}
              size={44}
              className="welcome__avatar"
            />
          ) : (
            <PixelAvatar name={boot.account.name} size={44} className="welcome__avatar" />
          )}
        </div>
      </header>

      {activeTask ? <ActiveTaskStrip task={activeTask} onClick={() => navigate('downloads')} /> : null}

      <section className="home-grid">
        <div
          className="hero-play"
          style={{ '--hero-accent': activeInstance?.accent || 'var(--accent)' } as React.CSSProperties}
        >
          <WorldArt accent={activeInstance?.accent || 'var(--accent)'} />
          <div className="hero-play__shade" />
          {activeInstance ? (
            <>
              <div className="hero-play__content">
                <div className="hero-play__kicker">
                  <StatusDot tone={activeRunning ? 'success' : 'accent'} pulse={activeRunning} />
                  {activeRunning ? '正在运行' : '继续你的世界'}
                </div>
                <h2>{activeInstance.name}</h2>
                <div className="hero-play__tags">
                  <Badge tone="accent">Minecraft {activeInstance.mcVersion}</Badge>
                  <Badge tone="outline">
                    {LOADER_LABEL[activeInstance.loader] || activeInstance.loader}
                  </Badge>
                  {activeInstance.mods.length ? (
                    <Badge tone="neutral">{activeInstance.mods.length} 个模组</Badge>
                  ) : null}
                </div>
                <p className="hero-play__meta">
                  {activeInstance.lastPlayedAt
                    ? `上次游玩于 ${formatRelative(activeInstance.lastPlayedAt)} · 已累计 ${formatPlaytime(activeInstance.totalPlayTimeMs)}`
                    : '这是你的新世界，准备好开始第一次冒险了吗？'}
                </p>
                <div className="hero-play__actions">
                  <Button
                    variant={activeRunning ? 'danger' : 'primary'}
                    size="lg"
                    loading={activeLaunching}
                    icon={
                      activeRunning ? (
                        <Square size={14} fill="currentColor" />
                      ) : (
                        <Play size={16} fill="currentColor" />
                      )
                    }
                    onClick={() => void launch(activeInstance.id)}
                  >
                    {activeRunning ? '结束游戏' : activeLaunching ? '正在启动' : '启动游戏'}
                  </Button>
                  <Button variant="ghost" size="lg" onClick={() => openInstance(activeInstance.id)}>
                    实例详情
                  </Button>
                  <Button
                    variant="ghost"
                    size="lg"
                    icon={<Puzzle size={16} />}
                    onClick={() => openMods(activeInstance.id)}
                  >
                    装模组
                  </Button>
                </div>
              </div>
              <div className="hero-play__corner">
                <InstanceEmblem accent={activeInstance.accent} icon={activeInstance.icon} size={62} />
              </div>
            </>
          ) : (
            <div className="hero-empty">
              <div className="hero-empty__art">
                <InstanceEmblem accent="#b8e85c" icon="trees" size={86} />
              </div>
              <div className="hero-play__kicker">
                <Sparkles size={14} />
                从第一块方块开始
              </div>
              <h2>你的世界，还没命名</h2>
              <p>
                创建一个游戏实例，选择原版或 Fabric、Forge、NeoForge 等加载器，再挑几个喜欢的模组。剩下的，就交给想象力。
              </p>
              <div className="hero-play__actions">
                <Button
                  variant="primary"
                  size="lg"
                  icon={<Plus size={17} />}
                  onClick={openCreateInstance}
                >
                  创建第一个实例
                </Button>
                <Button variant="ghost" size="lg" onClick={() => navigate('mods')}>
                  先逛逛模组
                </Button>
              </div>
            </div>
          )}
        </div>

        <aside className="home-side">
          <div className="panel runtime-panel">
            <div className="panel__header">
              <div>
                <div className="panel__eyebrow">本地环境</div>
                <h3>运行状态</h3>
              </div>
              <Badge tone={javaRuntime ? 'success' : 'warn'}>
                <StatusDot tone={javaRuntime ? 'success' : 'warn'} />
                {javaRuntime ? '已就绪' : '待准备'}
              </Badge>
            </div>
            <div className="runtime-list">
              <div className="runtime-row">
                <span className="runtime-row__icon">
                  <Cpu size={17} />
                </span>
                <div>
                  <span>Java 运行时</span>
                  <strong>
                    {javaRuntime ? `Java ${javaRuntime.majorVersion}` : '将在安装实例时自动下载'}
                  </strong>
                </div>
              </div>
              <div className="runtime-row">
                <span className="runtime-row__icon">
                  <HardDrive size={17} />
                </span>
                <div>
                  <span>默认内存</span>
                  <strong>{(boot.settings.memoryMb / 1024).toFixed(1)} GB</strong>
                </div>
              </div>
              <div className="runtime-row runtime-row--path">
                <span className="runtime-row__icon">
                  <FolderOpen size={17} />
                </span>
                <div>
                  <span>游戏数据目录</span>
                  <strong title={boot.dataPath}>{boot.dataPath}</strong>
                </div>
              </div>
            </div>
            <button type="button" className="text-action" onClick={() => void openData()}>
              打开数据目录
              <ArrowRight size={14} />
            </button>
          </div>

          <div className="panel quick-panel">
            <div className="panel__eyebrow">快捷入口</div>
            <div className="quick-grid">
              <button type="button" className="quick-action" onClick={openCreateInstance}>
                <span className="quick-action__icon quick-action__icon--accent">
                  <Plus size={18} />
                </span>
                <span>
                  <strong>新建实例</strong>
                  <small>下载游戏版本</small>
                </span>
              </button>
              <button type="button" className="quick-action" onClick={() => openMods()}>
                <span className="quick-action__icon">
                  <Puzzle size={18} />
                </span>
                <span>
                  <strong>模组工坊</strong>
                  <small>Modrinth / CurseForge</small>
                </span>
              </button>
              <button type="button" className="quick-action" onClick={() => navigate('downloads')}>
                <span className="quick-action__icon">
                  <Download size={18} />
                </span>
                <span>
                  <strong>下载中心</strong>
                  <small>
                    {tasks.filter((task) => task.status === 'running').length
                      ? `${tasks.filter((task) => task.status === 'running').length} 个进行中`
                      : '暂无进行中任务'}
                  </small>
                </span>
              </button>
              <button type="button" className="quick-action" onClick={() => navigate('settings')}>
                <span className="quick-action__icon">
                  <Sparkles size={18} />
                </span>
                <span>
                  <strong>偏好设置</strong>
                  <small>Java 与内存</small>
                </span>
              </button>
            </div>
          </div>
        </aside>
      </section>

      {recent.length ? (
        <section className="home-section">
          <SectionHeading
            eyebrow="你的书架"
            title="最近实例"
            description="按最近游玩时间排列"
            action={
              <Button variant="ghost" size="sm" onClick={() => navigate('instances')}>
                全部实例
                <ArrowRight size={14} />
              </Button>
            }
          />
          <div className="instance-grid instance-grid--home">
            {recent.map((instance) => (
              <InstanceCard
                key={instance.id}
                instance={instance}
                compact
                running={running.has(instance.id)}
                launching={launching.has(instance.id)}
                onLaunch={() => void launch(instance.id)}
                onOpen={() => openInstance(instance.id)}
              />
            ))}
          </div>
        </section>
      ) : (
        <section className="home-section">
          <SectionHeading eyebrow="三步开始" title="从零到进入世界" />
          <div className="steps-grid">
            <StepCard index="01" title="创建实例" description="选择 Minecraft 版本与模组加载器，官方文件与 Java 自动下载。" />
            <StepCard index="02" title="挑选模组" description="在模组工坊搜索 Modrinth，一键安装并自动补齐前置。" />
            <StepCard index="03" title="启动游戏" description="Java 与内存都准备好了，点击启动，去创造你的世界。" />
          </div>
        </section>
      )}

      <FeaturedMods />
    </div>
  )
}

function ActiveTaskStrip({ task, onClick }: { task: TaskView; onClick: () => void }): React.JSX.Element {
  return (
    <button type="button" className="activity-strip" onClick={onClick}>
      <span className="activity-strip__icon">
        <Download size={16} />
      </span>
      <div className="activity-strip__body">
        <div className="activity-strip__top">
          <strong>{task.title}</strong>
          <span>{Math.round(task.progress)}%</span>
        </div>
        <ProgressBar value={task.progress} compact />
      </div>
      <span className="activity-strip__detail">{task.detail}</span>
      <ArrowRight size={16} className="activity-strip__arrow" />
    </button>
  )
}

function StepCard({
  index,
  title,
  description
}: {
  index: string
  title: string
  description: string
}): React.JSX.Element {
  return (
    <div className="step-card">
      <span className="step-card__index">{index}</span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  )
}

function FeaturedMods(): React.JSX.Element {
  const { navigate, openMods } = useLauncher()
  const [mods, setMods] = useState<ModSearchHit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async (): Promise<void> => {
    setLoading(true)
    setError('')
    const result = await window.fangjie.searchMods('', { limit: 6, sort: 'downloads' })
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setMods(result.value.hits.slice(0, 4))
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <section className="home-section">
      <SectionHeading
        eyebrow="MODRINTH 精选"
        title="大家正在玩"
        description="热门模组，点开即可在模组工坊中查看"
        action={
          <Button variant="ghost" size="sm" onClick={() => openMods()}>
            进入工坊
            <ArrowRight size={14} />
          </Button>
        }
      />
      {loading ? (
        <div className="featured-mods">
          {[0, 1, 2, 3].map((index) => (
            <div className="featured-mod featured-mod--skeleton" key={index}>
              <Skeleton style={{ width: 46, height: 46, borderRadius: 12 }} />
              <div>
                <Skeleton style={{ width: '55%', height: 15 }} />
                <Skeleton style={{ width: '90%', height: 12, marginTop: 8 }} />
                <Skeleton style={{ width: '40%', height: 11, marginTop: 8 }} />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <InlineNotice
          tone="warn"
          title="暂时无法连接 Modrinth"
          action={
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void load()}>
              重试
            </Button>
          }
        >
          {error}
        </InlineNotice>
      ) : (
        <div className="featured-mods">
          {mods.map((mod) => (
            <button
              key={mod.project_id}
              type="button"
              className="featured-mod"
              onClick={() => navigate('mods')}
            >
              {mod.icon_url ? (
                <img src={mod.icon_url} alt="" loading="lazy" />
              ) : (
                <span className="featured-mod__fallback">
                  <Puzzle size={22} />
                </span>
              )}
              <span className="featured-mod__body">
                <strong>{mod.title}</strong>
                <span>{mod.description}</span>
                <small>
                  <Download size={12} />
                  {formatCompactNumber(mod.downloads)}
                  <span className="featured-mod__dot" />
                  {categoryLabel(mod.display_categories?.[0] || mod.categories[0] || '')}
                </small>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
