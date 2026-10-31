import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock3,
  Cpu,
  Download,
  Image,
  Package,
  Play,
  Puzzle,
  RefreshCw,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  Wrench,
  XCircle
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { TaskView } from '../../../shared/types'
import { useLauncher } from '../state/LauncherContext'
import { Badge, Button, EmptyState, IconButton, InlineNotice, ProgressBar } from '../components/ui'
import { classNames, formatRelative, formatSpeed } from '../lib/format'

export function DownloadsPage(): React.JSX.Element {
  const {
    tasks,
    boot,
    running,
    launching,
    openInstance,
    openCreateInstance,
    openMods,
    launch,
    refresh,
    toast
  } = useLauncher()
  const active = tasks.filter((task) => task.status === 'running' || task.status === 'queued')
  const finished = tasks
    .filter((task) => ['success', 'error', 'cancelled'].includes(task.status))
    .sort((left, right) => (right.endedAt || right.createdAt) - (left.endedAt || left.createdAt))
  const totalSpeed = active.reduce((sum, task) => sum + (task.bytesPerSecond || 0), 0)

  const cancel = async (task: TaskView): Promise<void> => {
    const result = await window.fangjie.cancelTask(task.id)
    if (!result.ok) toast(result.error, 'error')
    else toast('任务已取消', 'info')
  }

  const retry = async (task: TaskView): Promise<void> => {
    if (!task.instanceId || !task.projectId) return
    const result = await window.fangjie.installMod(task.instanceId, task.projectId)
    if (!result.ok) toast(result.error, 'error')
    else toast('已重新开始安装', 'success')
  }

  const clearFinished = async (): Promise<void> => {
    const result = await window.fangjie.clearTasks()
    if (!result.ok) {
      toast(result.error, 'error')
      return
    }
    await refresh()
  }

  return (
    <div className="page page--downloads">
      <header className="page-header">
        <div>
          <div className="eyebrow">ACTIVITY</div>
          <h1>下载中心</h1>
          <p>游戏安装、Java 运行时与模组下载都会在这里留下记录。</p>
        </div>
        {finished.length ? (
          <Button variant="ghost" icon={<Trash2 size={15} />} onClick={() => void clearFinished()}>
            清除已完成
          </Button>
        ) : null}
      </header>

      <section className="download-hub">
        <button type="button" className="download-hub__card download-hub__card--primary" onClick={openCreateInstance}>
          <span className="download-hub__icon"><Boxes size={22} /></span>
          <span className="download-hub__copy">
            <strong>游戏版本</strong>
            <small>安装原版或带加载器的完整版本</small>
          </span>
          <ArrowRight size={17} />
        </button>
        <button type="button" className="download-hub__card" onClick={() => openMods(undefined, 'mod')}>
          <span className="download-hub__icon"><Puzzle size={20} /></span>
          <span className="download-hub__copy">
            <strong>模组</strong>
            <small>Modrinth / CurseForge 双源</small>
          </span>
          <ArrowRight size={16} />
        </button>
        <button type="button" className="download-hub__card" onClick={() => openMods(undefined, 'modpack')}>
          <span className="download-hub__icon"><Package size={20} /></span>
          <span className="download-hub__copy">
            <strong>整合包</strong>
            <small>下载 .mrpack 或直接使用</small>
          </span>
          <ArrowRight size={16} />
        </button>
        <button type="button" className="download-hub__card" onClick={() => openMods(undefined, 'resourcepack')}>
          <span className="download-hub__icon"><Image size={20} /></span>
          <span className="download-hub__copy">
            <strong>资源包</strong>
            <small>材质、界面与音效</small>
          </span>
          <ArrowRight size={16} />
        </button>
        <button type="button" className="download-hub__card" onClick={() => openMods(undefined, 'shader')}>
          <span className="download-hub__icon"><Sparkles size={20} /></span>
          <span className="download-hub__copy">
            <strong>光影</strong>
            <small>为世界换一套光线</small>
          </span>
          <ArrowRight size={16} />
        </button>
        <button type="button" className="download-hub__card" onClick={openCreateInstance}>
          <span className="download-hub__icon"><Wrench size={20} /></span>
          <span className="download-hub__copy">
            <strong>加载器</strong>
            <small>单独安装 Fabric / Forge 等</small>
          </span>
          <ArrowRight size={16} />
        </button>
      </section>

      {boot.instances.length ? (
        <section className="download-versions">
          <div className="download-section__heading">
            <h2>已安装版本</h2>
            <span>选择版本后可直接启动</span>
          </div>
          <div className="download-version-list">
            {boot.instances.map((instance) => {
              const isRunning = running.has(instance.id)
              const isLaunching = launching.has(instance.id)
              return (
                <div className="download-version" key={instance.id}>
                  <button type="button" className="download-version__open" onClick={() => openInstance(instance.id)}>
                    <strong>{instance.name}</strong>
                    <small>
                      Minecraft {instance.mcVersion} · {instance.loader === 'vanilla' ? '原版' : instance.loader}
                      {instance.modCount ? ` · ${instance.modCount} 个模组` : ''}
                    </small>
                  </button>
                  <Button
                    size="sm"
                    variant={isRunning ? 'danger' : 'primary'}
                    loading={isLaunching}
                    icon={isRunning ? <Square size={11} fill="currentColor" /> : <Play size={11} fill="currentColor" />}
                    onClick={() => void launch(instance.id)}
                  >
                    {isRunning ? '结束' : '启动'}
                  </Button>
                  <button
                    type="button"
                    className="download-version__settings"
                    onClick={() => openInstance(instance.id)}
                    aria-label={`${instance.name} 版本设置`}
                  >
                    <Settings2 size={15} />
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      <section className="download-summary">
        <div>
          <span className="download-summary__icon"><Download size={18} /></span>
          <div>
            <span>正在下载</span>
            <strong>{active.length}</strong>
          </div>
        </div>
        <div>
          <span className="download-summary__icon"><RefreshCw size={18} /></span>
          <div>
            <span>当前速度</span>
            <strong>{totalSpeed ? formatSpeed(totalSpeed) : '—'}</strong>
          </div>
        </div>
        <div>
          <span className="download-summary__icon"><CheckCircle2 size={18} /></span>
          <div>
            <span>已完成</span>
            <strong>{tasks.filter((task) => task.status === 'success').length}</strong>
          </div>
        </div>
      </section>

      {active.length ? (
        <section className="download-section">
          <div className="download-section__heading">
            <h2>进行中</h2>
            <Badge tone="accent">{active.length}</Badge>
          </div>
          <div className="task-list">
            {active.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onCancel={() => void cancel(task)}
                onOpenInstance={
                  task.instanceId && boot.instances.some((instance) => instance.id === task.instanceId)
                    ? () => openInstance(task.instanceId as string)
                    : undefined
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      {finished.length ? (
        <section className="download-section">
          <div className="download-section__heading">
            <h2>历史记录</h2>
            <span>{finished.length} 条</span>
          </div>
          <div className="task-list">
            {finished.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onRetry={task.kind === 'mod' ? () => void retry(task) : undefined}
                onOpenInstance={
                  task.instanceId && boot.instances.some((instance) => instance.id === task.instanceId)
                    ? () => openInstance(task.instanceId as string)
                    : undefined
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      {!active.length && !finished.length ? (
        <div className="download-empty">
          <EmptyState
            icon={<Download size={25} />}
            title="下载队列是空的"
            description="创建游戏实例或安装一个模组，下载进度会实时出现在这里。"
            action={
              <Button variant="primary" onClick={openCreateInstance}>
                去创建实例
              </Button>
            }
          />
          <div className="download-empty__note">
            <Clock3 size={15} />
            下载任务在应用运行期间保留；关闭启动器后，已完成的文件不会被删除。
          </div>
        </div>
      ) : null}
    </div>
  )
}

function TaskRow({
  task,
  onCancel,
  onRetry,
  onOpenInstance
}: {
  task: TaskView
  onCancel?: () => void
  onRetry?: () => void
  onOpenInstance?: () => void
}): React.JSX.Element {
  const isActive = task.status === 'running' || task.status === 'queued'
  const kind = kindMeta(task.kind)

  return (
    <article className={classNames('task-row', `task-row--${task.status}`)}>
      <div className="task-row__icon" style={{ color: kind.color }}>
        {kind.icon}
      </div>
      <div className="task-row__main">
        <div className="task-row__heading">
          <div>
            <h3>{task.title}</h3>
            <span>{task.subtitle || kind.label}</span>
          </div>
          {isActive ? (
            <div className="task-row__actions">
              {task.bytesPerSecond ? <span className="task-row__speed">{formatSpeed(task.bytesPerSecond)}</span> : null}
              <Button variant="ghost" size="sm" onClick={onCancel}>
                取消
              </Button>
            </div>
          ) : task.status === 'success' ? (
            <div className="task-row__end">
              <Badge tone="success"><CheckCircle2 size={12} /> 完成</Badge>
              <span>{formatRelative(task.endedAt)}</span>
            </div>
          ) : task.status === 'cancelled' ? (
            <div className="task-row__end">
              <Badge tone="neutral"><XCircle size={12} /> 已取消</Badge>
              <span>{formatRelative(task.endedAt)}</span>
            </div>
          ) : (
            <div className="task-row__end">
              <Badge tone="warn"><AlertTriangle size={12} /> 失败</Badge>
              <span>{formatRelative(task.endedAt)}</span>
            </div>
          )}
        </div>

        {isActive ? (
          <div className="task-row__progress">
            <ProgressBar value={task.progress} compact />
            <span>{Math.round(task.progress)}%</span>
          </div>
        ) : null}

        <div className="task-row__detail">
          <span>{task.status === 'error' ? task.error || task.detail : task.detail}</span>
        </div>

        {task.status === 'error' && onRetry ? (
          <div className="task-row__recovery">
            <span>可以重新下载，已存在的文件不会重复写入。</span>
            <Button size="sm" variant="secondary" icon={<RefreshCw size={13} />} onClick={onRetry}>
              重试
            </Button>
          </div>
        ) : null}

        {task.status === 'success' ? (
          <div className="task-row__recovery">
            <span>{kind.successHint}</span>
            {onOpenInstance ? (
              <Button size="sm" variant="ghost" icon={<ArrowRight size={13} />} onClick={onOpenInstance}>
                查看实例
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  )
}

function kindMeta(kind: TaskView['kind']): {
  label: string
  icon: ReactNode
  color: string
  successHint: string
} {
  if (kind === 'mod') {
    return {
      label: '模组下载',
      icon: <Puzzle size={19} />,
      color: '#b8a1f5',
      successHint: '模组已写入实例的 mods 文件夹。'
    }
  }
  if (kind === 'java') {
    return {
      label: 'Java 运行时',
      icon: <Cpu size={19} />,
      color: '#8ecae6',
      successHint: '运行时已准备好，启动游戏时会自动使用。'
    }
  }
  if (kind === 'repair') {
    return {
      label: '实例修复',
      icon: <RefreshCw size={19} />,
      color: '#f2b860',
      successHint: '实例文件已修复。'
    }
  }
  return {
    label: '游戏实例',
    icon: <Boxes size={19} />,
    color: '#b8e85c',
    successHint: '游戏文件与 Java 已准备好，可以启动游玩了。'
  }
}
