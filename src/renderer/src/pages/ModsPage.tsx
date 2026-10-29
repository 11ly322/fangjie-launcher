import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Clock3,
  Download,
  ExternalLink,
  FolderOpen,
  Package,
  Plus,
  RefreshCw,
  Search,
  Sparkles
} from 'lucide-react'
import type {
  InstalledMod,
  ModProject,
  ModSearchHit,
  ModSource,
  ModVersion
} from '../../../shared/types'
import { LOADER_LABEL, MOD_CATEGORIES, MODDED_LOADERS } from '../../../shared/constants'
import { useLauncher } from '../state/LauncherContext'
import { InstanceEmblem } from '../components/Artwork'
import { Badge, Button, InlineNotice, Modal, Select, Skeleton, TextInput } from '../components/ui'
import { ModCard, categoryLabel, isLoaderTag } from '../components/ModCard'
import {
  classNames,
  formatBytes,
  formatCompactNumber,
  formatDate,
  formatRelative,
  stripMarkdown
} from '../lib/format'

type SortMode = 'downloads' | 'updated' | 'newest' | 'relevance'

interface ModDetailState {
  hit: ModSearchHit
  project?: ModProject
  versions?: ModVersion[]
  loading: boolean
  error: string
}

const PAGE_SIZE = 18

export function ModsPage(): React.JSX.Element {
  const {
    boot,
    tasks,
    modsInstanceId,
    setModsInstanceId,
    openCreateInstance,
    openInstance,
    toast
  } = useLauncher()
  const moddedInstances = boot.instances.filter((instance) =>
    MODDED_LOADERS.includes(instance.loader as (typeof MODDED_LOADERS)[number])
  )
  const selectedInstance = moddedInstances.find((instance) => instance.id === modsInstanceId) || null

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState<SortMode>('downloads')
  const [projectType, setProjectType] = useState<'mod' | 'resourcepack' | 'shader'>('mod')
  const [source, setSource] = useState<ModSource>(() =>
    localStorage.getItem('fangjie.modSource') === 'curseforge' ? 'curseforge' : 'modrinth'
  )
  const [hits, setHits] = useState<ModSearchHit[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [installed, setInstalled] = useState<InstalledMod[]>([])
  const [detail, setDetail] = useState<ModDetailState | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    if (!modsInstanceId && moddedInstances.length) {
      setModsInstanceId(moddedInstances[0].id)
    }
  }, [moddedInstances, modsInstanceId, setModsInstanceId])

  useEffect(() => {
    if (!selectedInstance) {
      setInstalled([])
      return
    }
    let active = true
    void window.fangjie.instanceMods(selectedInstance.id).then((result) => {
      if (active && result.ok) setInstalled(result.value)
    })
    return () => {
      active = false
    }
  }, [selectedInstance?.id, selectedInstance?.mods.length])

  useEffect(() => {
    setDetail(null)
  }, [selectedInstance?.id])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchPage(0)
    }, 280)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, category, sort, source, projectType, selectedInstance?.id])

  const installedIds = useMemo(() => new Set(installed.map((mod) => mod.projectId)), [installed])

  const installingIds = useMemo(() => {
    return new Set(
      tasks
        .filter(
          (task) =>
            task.kind === 'mod' &&
            (task.status === 'running' || task.status === 'queued') &&
            task.instanceId === selectedInstance?.id
        )
        .map((task) => task.projectId)
        .filter((value): value is string => Boolean(value))
    )
  }, [tasks, selectedInstance?.id])

  const activeTasks = useMemo(
    () => tasks.filter((task) => task.kind === 'mod' && task.status === 'running'),
    [tasks]
  )

  async function fetchPage(nextOffset: number): Promise<void> {
    const current = ++requestId.current
    if (nextOffset === 0) {
      setLoading(true)
      setError('')
    } else {
      setLoadingMore(true)
    }
    const result = await window.fangjie.searchMods(query, {
      instanceId: selectedInstance?.id,
      category,
      offset: nextOffset,
      limit: PAGE_SIZE,
      sort,
      source,
      projectType
    })
    if (current !== requestId.current) return
    setLoading(false)
    setLoadingMore(false)
    if (!result.ok) {
      setError(result.error)
      if (nextOffset === 0) setHits([])
      return
    }
    setHits((existing) => (nextOffset === 0 ? result.value.hits : [...existing, ...result.value.hits]))
    setTotal(result.value.total_hits)
    setOffset(nextOffset)
  }

  function install(project: ModSearchHit | ModProject): void {
    if (!selectedInstance) {
      toast('先选择一个带模组加载器的实例，才能安装模组', 'info')
      return
    }
    if (projectType === 'mod') {
      if (installedIds.has(project.project_id) || installingIds.has(project.project_id)) return
      void window.fangjie.installMod(selectedInstance.id, project.project_id).then((result) => {
        if (!result.ok) {
          toast(result.error, 'error')
          return
        }
        toast(`已开始安装「${project.title}」`, 'success')
      })
      return
    }
    void window.fangjie
      .installAsset(selectedInstance.id, project.project_id, projectType, source)
      .then((result) => {
        if (!result.ok) {
          toast(result.error, 'error')
          return
        }
        toast(`已安装「${project.title}」到 ${selectedInstance.name}`, 'success')
      })
  }

  async function openDetail(hit: ModSearchHit): Promise<void> {
    setDetail({ hit, loading: true, error: '' })
    const lookupId = hit.source === 'curseforge' ? hit.project_id : hit.slug || hit.project_id
    const result = await window.fangjie.getModProject(lookupId, selectedInstance?.id, projectType)
    if (!result.ok) {
      setDetail((current) =>
        current && current.hit.project_id === hit.project_id
          ? { ...current, loading: false, error: result.error }
          : current
      )
      return
    }
    setDetail((current) =>
      current && current.hit.project_id === hit.project_id
        ? { ...current, loading: false, project: result.value.project, versions: result.value.versions }
        : current
    )
  }

  return (
    <div className="page page--mods">
      <header className="page-header page-header--mods">
        <div>
          <div className="eyebrow">MOD WORKSHOP</div>
          <h1>模组工坊</h1>
          <p>发现、下载并管理模组。选择实例后，只显示兼容版本，前置依赖会自动补齐。</p>
        </div>
        <Button variant="secondary" icon={<Plus size={16} />} onClick={openCreateInstance}>
          新建实例
        </Button>
      </header>

      {!moddedInstances.length ? (
        <InlineNotice
          tone="warn"
          icon={<Sparkles size={18} />}
          title="还没有可安装模组的实例"
          action={
            <Button size="sm" variant="primary" onClick={openCreateInstance}>
              创建模组实例
            </Button>
          }
        >
          你可以先浏览所有模组，但安装需要带加载器的实例。创建后会下载游戏、加载器与
          Java，并在工坊中自动匹配版本。
        </InlineNotice>
      ) : null}

      <div className="asset-kind-tabs segmented" role="group" aria-label="项目类型">
        {([
          ['mod', '模组'],
          ['resourcepack', '资源包'],
          ['shader', '光影']
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={classNames('segmented__item', projectType === value && 'is-active')}
            aria-pressed={projectType === value}
            onClick={() => {
              setProjectType(value)
              setCategory('')
              setHits([])
              setOffset(0)
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="mods-filter-panel">
        <div className="mods-filter-row">
          <div className="instance-target">
            <span className="instance-target__label">安装到</span>
            {moddedInstances.length ? (
              <>
                <Select
                  value={selectedInstance?.id || ''}
                  onChange={(event) => setModsInstanceId(event.target.value || null)}
                  aria-label="选择目标实例"
                >
                  {moddedInstances.map((instance) => (
                    <option key={instance.id} value={instance.id}>
                      {instance.name} · {LOADER_LABEL[instance.loader]} {instance.mcVersion}
                    </option>
                  ))}
                </Select>
                {selectedInstance ? (
                  <button
                    type="button"
                    className="instance-target__open"
                    onClick={() => openInstance(selectedInstance.id)}
                    title="查看实例"
                    aria-label="查看目标实例"
                  >
                    <InstanceEmblem accent={selectedInstance.accent} icon={selectedInstance.icon} size={28} />
                  </button>
                ) : null}
              </>
            ) : (
              <span className="instance-target__empty">暂无可安装模组的实例</span>
            )}
          </div>

          <div className="search-box search-box--mods">
            <Search size={18} className="search-box__icon" />
            <TextInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={projectType === 'mod' ? '搜索模组，例如 Sodium、Create、地图…' : projectType === 'resourcepack' ? '搜索资源包，例如 Faithful、Stay True…' : '搜索光影，例如 Complementary、BSL…'}
              aria-label={projectType === 'mod' ? '搜索模组' : projectType === 'resourcepack' ? '搜索资源包' : '搜索光影'}
            />
          </div>

          <Select
            className="source-select"
            value={source}
            onChange={(event) => {
              const next = event.target.value as ModSource
              if (next === source) return
              localStorage.setItem('fangjie.modSource', next)
              setSource(next)
              setHits([])
              setOffset(0)
            }}
            aria-label="项目下载源"
          >
            <option value="modrinth">Modrinth 源</option>
            <option value="curseforge">CurseForge 源</option>
          </Select>

          <Select
            className="sort-select"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortMode)}
            aria-label="排序方式"
          >
            <option value="downloads">热门优先</option>
            <option value="updated">最近更新</option>
            <option value="newest">最新发布</option>
            <option value="relevance">相关度</option>
          </Select>
        </div>

        {projectType === 'mod' ? (
          <div className="category-chips" role="group" aria-label="模组分类">
          {MOD_CATEGORIES.map((item) => (
            <button
              key={item.id || 'all'}
              type="button"
              className={classNames('category-chip', category === item.id && 'is-active')}
              onClick={() => setCategory(item.id)}
              aria-pressed={category === item.id}
            >
              {item.label}
            </button>
          ))}
          </div>
        ) : null}
      </section>

      <div className="mods-result-bar">
        <div>
          <span className="result-count">
            {loading ? '正在寻找…' : `${formatCompactNumber(total)} 个结果`}
          </span>
          {selectedInstance ? (
            <span className="result-context">
              {projectType === 'mod' ? '兼容' : '游戏版本'} <strong>{selectedInstance.mcVersion}</strong>
              {projectType === 'mod' ? <> / <strong>{LOADER_LABEL[selectedInstance.loader]}</strong></> : null}
            </span>
          ) : (
            <span className="result-context">浏览全部模组项目</span>
          )}
          <span className="result-context">
            来源 {source === 'curseforge' ? 'CurseForge' : 'Modrinth'}
          </span>
        </div>
        {activeTasks.length ? (
          <span className="mods-active-installs">
            <span className="live-badge__dot" />
            {activeTasks.length} 个安装任务进行中
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="mods-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="mod-skeleton" key={index}>
              <Skeleton style={{ width: 56, height: 56, borderRadius: 14 }} />
              <div>
                <Skeleton style={{ width: '45%', height: 16 }} />
                <Skeleton style={{ width: '90%', height: 12, marginTop: 10 }} />
                <Skeleton style={{ width: '75%', height: 12, marginTop: 6 }} />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <InlineNotice
          tone="danger"
          title="模组列表加载失败"
          action={
            <Button
              size="sm"
              variant="secondary"
              icon={<RefreshCw size={14} />}
              onClick={() => void fetchPage(0)}
            >
              重试
            </Button>
          }
        >
          {error}
        </InlineNotice>
      ) : hits.length ? (
        <>
          <div className="mods-grid">
            {hits.map((project) => (
              <ModCard
                key={project.project_id}
                project={project}
                installed={installedIds.has(project.project_id)}
                installing={installingIds.has(project.project_id)}
                canInstall={Boolean(selectedInstance)}
                disabledReason="请先创建一个带加载器的实例"
                onInstall={() => install(project)}
                onOpen={() => void openDetail(project)}
              />
            ))}
          </div>
          <div className="mods-load-more">
            {hits.length < total ? (
              <Button
                variant="secondary"
                loading={loadingMore}
                onClick={() => void fetchPage(offset + PAGE_SIZE)}
              >
                加载更多模组
              </Button>
            ) : (
              <span>已经看到最后了 · 共 {hits.length} 个结果</span>
            )}
          </div>
        </>
      ) : (
        <div className="empty-inline empty-inline--mods">
          <Package size={30} />
          <h4>没有找到匹配的模组</h4>
          <p>试试其它关键词或分类，也可以先清除筛选条件。</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setQuery('')
              setCategory('')
            }}
          >
            清除筛选
          </Button>
        </div>
      )}

      <ModDetailModal
        detail={detail}
        onClose={() => setDetail(null)}
        selectedInstanceName={selectedInstance?.name}
        selectedInstanceVersion={selectedInstance?.mcVersion}
        selectedLoader={projectType === 'mod' ? (selectedInstance ? LOADER_LABEL[selectedInstance.loader] : '模组') : projectType === 'resourcepack' ? '资源包' : '光影'}
        projectType={projectType}
        installed={projectType === 'mod' && detail ? installed.find((mod) => mod.projectId === detail.hit.project_id) : undefined}
        installing={Boolean(
          detail?.hit.project_id && installingIds.has(detail.hit.project_id)
        )}
        canInstall={Boolean(selectedInstance)}
        onInstall={() => {
          if (!detail) return
          install(detail.project || detail.hit)
        }}
        onOpenFolder={
          selectedInstance
            ? () => void window.fangjie.openInstanceFolder(selectedInstance.id)
            : undefined
        }
      />
    </div>
  )
}

function ModDetailModal({
  detail,
  onClose,
  selectedInstanceName,
  selectedInstanceVersion,
  selectedLoader,
  projectType,
  installed,
  installing,
  canInstall,
  onInstall,
  onOpenFolder
}: {
  detail: ModDetailState | null
  onClose: () => void
  selectedInstanceName?: string
  selectedInstanceVersion?: string
  selectedLoader: string
  projectType: 'mod' | 'resourcepack' | 'shader'
  installed?: InstalledMod
  installing: boolean
  canInstall: boolean
  onInstall: () => void
  onOpenFolder?: () => void
}): React.JSX.Element {
  const project = detail?.project
  const versions = detail?.versions || []
  const latest = versions[0]
  const primaryFile = latest?.files.find((file) => file.primary) || latest?.files[0]
  const body = project?.body ? stripMarkdown(project.body) : ''
  const paragraphs = body.split(/\n{2,}/).filter(Boolean).slice(0, 8)
  const isCurseForge = project?.source === 'curseforge' || detail?.hit.source === 'curseforge'
  const kindPath = projectType === 'resourcepack' ? 'resourcepack' : projectType === 'shader' ? 'shader' : 'mod'
  const externalUrl =
    project?.website_url ||
    (isCurseForge
      ? `https://www.curseforge.com/minecraft/${projectType === 'mod' ? 'mc-mods' : projectType === 'resourcepack' ? 'texture-packs' : 'shaders'}/${project?.slug || detail?.hit.slug}`
      : `https://modrinth.com/${kindPath}/${project?.slug || detail?.hit.slug}`)

  return (
    <Modal
      open={Boolean(detail)}
      onClose={onClose}
      title={project?.title || detail?.hit.title || '模组详情'}
      description={project?.description || detail?.hit.description}
      size="lg"
      footer={
        <>
          <Button
            variant="ghost"
            icon={<ExternalLink size={15} />}
            onClick={() => window.open(externalUrl, '_blank')}
          >
            在 {isCurseForge ? 'CurseForge' : 'Modrinth'} 查看
          </Button>
          {installed && onOpenFolder ? (
            <Button variant="secondary" icon={<FolderOpen size={15} />} onClick={onOpenFolder}>
              打开实例文件夹
            </Button>
          ) : null}
          <Button
            variant={installed ? 'secondary' : 'primary'}
            icon={installed ? <Check size={16} /> : <Download size={16} />}
            disabled={!canInstall || Boolean(installed) || installing}
            loading={installing}
            onClick={onInstall}
          >
            {installed
              ? '已安装'
              : !canInstall
                ? '先选择模组实例'
                : installing
                  ? '正在安装'
                  : projectType === 'mod'
                    ? `安装到${selectedInstanceName ? ` ${selectedInstanceName}` : ''}`
                    : `安装${projectType === 'resourcepack' ? '资源包' : '光影'}${selectedInstanceName ? `到 ${selectedInstanceName}` : ''}`}
          </Button>
        </>
      }
    >
      {detail?.error ? (
        <InlineNotice tone="danger" title="项目详情加载失败">{detail.error}</InlineNotice>
      ) : null}
      {detail?.loading ? (
        <div className="detail-loading">
          <Skeleton style={{ width: 72, height: 72, borderRadius: 18 }} />
          <div>
            <Skeleton style={{ width: '40%', height: 18 }} />
            <Skeleton style={{ width: '80%', height: 12, marginTop: 10 }} />
            <Skeleton style={{ width: '60%', height: 12, marginTop: 6 }} />
          </div>
        </div>
      ) : (
        <>
          <div className="mod-detail-head">
            {detail?.hit.icon_url ? (
              <img src={detail.hit.icon_url} alt="" />
            ) : (
              <span className="mod-detail-head__fallback"><Package size={26} /></span>
            )}
            <div className="mod-detail-head__meta">
              <div className="detail-hero__tags">
                <Badge tone="accent">{selectedLoader}</Badge>
                <Badge tone="violet">{isCurseForge ? 'CurseForge' : 'Modrinth'}</Badge>
                {(project?.display_categories || detail?.hit.display_categories || [])
                  .filter((item) => !isLoaderTag(item))
                  .slice(0, 2)
                  .map((item) => (
                    <Badge tone="outline" key={item}>{categoryLabel(item)}</Badge>
                  ))}
                {latest ? <Badge tone="neutral">{latest.version_type}</Badge> : null}
              </div>
              <div className="mod-detail-stats">
                <span><Download size={13} /> {formatCompactNumber(project?.downloads || detail?.hit.downloads || 0)} 次下载</span>
                <span><Clock3 size={13} /> 更新于 {formatRelative(project?.date_modified || detail?.hit.date_modified)}</span>
              </div>
            </div>
          </div>

          {installed ? (
            <div className="installed-callout">
              <Check size={15} />
              <span>已安装 {installed.versionName || installed.fileName} 到 {selectedInstanceName}</span>
            </div>
          ) : null}

          {paragraphs.length ? (
            <div className="mod-detail-body">
              {paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          ) : (
            <p className="muted-copy">这个项目还没有提供详细介绍。</p>
          )}

          <div className="mod-version-panel">
            <div className="mod-version-panel__header">
              <div>
                <div className="panel__eyebrow">VERSIONS</div>
                <h3>可用版本</h3>
              </div>
              {selectedInstanceVersion ? (
                <Badge tone="outline">匹配 Minecraft {selectedInstanceVersion}</Badge>
              ) : null}
            </div>
            {versions.length ? (
              <div className="version-list">
                {versions.slice(0, 5).map((version) => (
                  <div className="version-list__row" key={version.id}>
                    <div>
                      <strong>{version.version_number}</strong>
                      <span>{version.name}</span>
                    </div>
                    <span className="version-list__type">{version.version_type}</span>
                    <span className="version-list__date">{formatDate(version.date_published)}</span>
                    <span className="version-list__size">
                      {formatBytes(version.files.find((file) => file.primary)?.size || 0)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted-copy">当前实例的游戏版本下没有可用版本。</p>
            )}
            {primaryFile ? (
              <p className="mod-version-panel__hint">
                安装时会下载最新兼容版本，并自动解析必需的前置模组。
              </p>
            ) : null}
          </div>
        </>
      )}
    </Modal>
  )
}
