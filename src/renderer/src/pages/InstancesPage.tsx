import { useMemo, useState } from 'react'
import {
  Boxes,
  FolderOpen,
  Plus,
  Search,
  SlidersHorizontal
} from 'lucide-react'
import { useLauncher } from '../state/LauncherContext'
import { InstanceCard } from '../components/InstanceCard'
import { BlockStack } from '../components/Artwork'
import { Button, EmptyState, TextInput } from '../components/ui'
import { classNames, formatPlaytime } from '../lib/format'

type LoaderFilter = 'all' | 'modded' | 'vanilla'

export function InstancesPage(): React.JSX.Element {
  const {
    boot,
    running,
    launching,
    openCreateInstance,
    openInstance,
    openMods,
    launch,
    toast
  } = useLauncher()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<LoaderFilter>('all')

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return [...boot.instances]
      .filter((instance) => {
        if (filter === 'modded' && instance.loader === 'vanilla') return false
        if (filter === 'vanilla' && instance.loader !== 'vanilla') return false
        if (!normalized) return true
        return (
          instance.name.toLowerCase().includes(normalized) ||
          instance.mcVersion.toLowerCase().includes(normalized)
        )
      })
      .sort((left, right) => (right.lastPlayedAt || right.createdAt) - (left.lastPlayedAt || left.createdAt))
  }, [boot.instances, filter, query])

  const totalMods = boot.instances.reduce((sum, instance) => sum + instance.modCount, 0)
  const totalPlaytime = boot.instances.reduce((sum, instance) => sum + instance.totalPlayTimeMs, 0)
  const moddedCount = boot.instances.filter((instance) => instance.loader !== 'vanilla').length

  const openFolder = async (id: string): Promise<void> => {
    const result = await window.fangjie.openInstanceFolder(id)
    if (!result.ok) toast(result.error, 'error')
  }

  return (
    <div className="page page--instances">
      <header className="page-header">
        <div>
          <div className="eyebrow">LIBRARY</div>
          <h1>游戏实例</h1>
          <p>每个实例都有独立的存档、模组与设置。为不同的冒险保留不同的世界。</p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={openCreateInstance}>
          新建实例
        </Button>
      </header>

      {boot.instances.length ? (
        <section className="stat-strip">
          <div className="stat-strip__item">
            <span>实例总数</span>
            <strong>{boot.instances.length}</strong>
          </div>
          <div className="stat-strip__item">
            <span>已安装模组</span>
            <strong>{totalMods}</strong>
          </div>
          <div className="stat-strip__item">
            <span>模组实例</span>
            <strong>{moddedCount}</strong>
          </div>
          <div className="stat-strip__item">
            <span>累计游玩</span>
            <strong>{formatPlaytime(totalPlaytime)}</strong>
          </div>
        </section>
      ) : null}

      {boot.instances.length ? (
        <div className="library-toolbar">
          <div className="search-box">
            <Search size={16} className="search-box__icon" />
            <TextInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索实例或版本号"
              aria-label="搜索实例"
            />
          </div>
          <div className="segmented" role="group" aria-label="筛选实例类型">
            {([
              ['all', '全部'],
              ['modded', '模组化'],
              ['vanilla', '原版']
            ] as Array<[LoaderFilter, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={classNames('segmented__item', filter === value && 'is-active')}
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="library-toolbar__count">
            <SlidersHorizontal size={14} />
            {filtered.length} 个实例
          </div>
        </div>
      ) : null}

      {!boot.instances.length ? (
        <div className="library-empty">
          <div className="library-empty__art">
            <BlockStack />
          </div>
          <EmptyState
            icon={<Boxes size={24} />}
            title="这里还很安静"
            description="创建第一个游戏实例。我们会下载官方游戏文件、匹配的 Java，以及你选择的模组加载器。"
            action={
              <Button variant="primary" icon={<Plus size={16} />} onClick={openCreateInstance}>
                创建第一个实例
              </Button>
            }
          />
          <div className="library-empty__features">
            <div>
              <strong>独立世界</strong>
              <span>存档、配置、模组互不干扰</span>
            </div>
            <div>
              <strong>自动准备</strong>
              <span>游戏、Java、运行库一次搞定</span>
            </div>
            <div>
              <strong>一键模组</strong>
              <span>连接 Modrinth，自动补齐前置</span>
            </div>
          </div>
        </div>
      ) : filtered.length ? (
        <div className="instance-grid">
          {filtered.map((instance) => (
            <InstanceCard
              key={instance.id}
              instance={instance}
              running={running.has(instance.id)}
              launching={launching.has(instance.id)}
              onLaunch={() => void launch(instance.id)}
              onOpen={() => openInstance(instance.id)}
              onOpenFolder={() => void openFolder(instance.id)}
            />
          ))}
          <button type="button" className="instance-add-card" onClick={openCreateInstance}>
            <span className="instance-add-card__icon">
              <Plus size={22} />
            </span>
            <strong>再来一个世界</strong>
            <span>下载新版本或创建模组实例</span>
          </button>
        </div>
      ) : (
        <EmptyState
          icon={<Search size={22} />}
          title="没有找到匹配的实例"
          description="换个关键词，或清除筛选条件再看看。"
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery('')
                setFilter('all')
              }}
            >
              清除筛选
            </Button>
          }
          compact
        />
      )}

      {filtered.length && filtered[0].loader !== 'vanilla' ? (
        <button type="button" className="discover-callout" onClick={() => openMods(filtered[0].id)}>
          <span className="discover-callout__icon">
            <FolderOpen size={18} />
          </span>
          <span>
            <strong>为「{filtered[0].name}」添加模组</strong>
            <small>
              浏览兼容 {filtered[0].loader} / Minecraft {filtered[0].mcVersion} 的项目
            </small>
          </span>
          <span className="discover-callout__arrow">前往模组工坊 →</span>
        </button>
      ) : null}
    </div>
  )
}
