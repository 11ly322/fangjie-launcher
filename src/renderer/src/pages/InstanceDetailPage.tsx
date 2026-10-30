import { useEffect, useState, type CSSProperties } from 'react'
import {
  ArrowLeft,
  Check,
  Clock3,
  Copy,
  Cpu,
  Download,
  FolderOpen,
  HardDrive,
  Play,
  Bookmark,
  Puzzle,
  RefreshCw,
  Settings2,
  Square,
  Terminal,
  Trash2
} from 'lucide-react'
import type { Instance, InstalledMod } from '../../../shared/types'
import {
  INSTANCE_ACCENTS,
  INSTANCE_ICON_LABELS,
  INSTANCE_ICONS,
  LOADER_LABEL
} from '../../../shared/constants'
import { useLauncher } from '../state/LauncherContext'
import { InstanceEmblem, WorldArt } from '../components/Artwork'
import {
  Badge,
  Button,
  Field,
  IconButton,
  InlineNotice,
  ProgressBar,
  Spinner,
  TextInput,
  Toggle
} from '../components/ui'
import { classNames, formatDate, formatPlaytime, formatRelative, rangeProgress } from '../lib/format'
import { CrashDiagnosticsModal } from '../components/CrashDiagnosticsModal'
import { FlightRecorderModal } from '../components/FlightRecorderModal'

type DetailTab = 'overview' | 'mods' | 'settings'

export function InstanceDetailPage({ instance }: { instance: Instance }): React.JSX.Element {
  const {
    boot,
    running,
    launching,
    tasks,
    logs,
    navigate,
    openMods,
    launch,
    refresh,
    toast,
    confirm,
    requestDeleteInstance
  } = useLauncher()
  const [tab, setTab] = useState<DetailTab>('overview')
  const [mods, setMods] = useState<InstalledMod[]>([])
  const [modsLoading, setModsLoading] = useState(false)
  const [modsError, setModsError] = useState('')
  const [busyFile, setBusyFile] = useState('')
  const [name, setName] = useState(instance.name)
  const [memory, setMemory] = useState(instance.memoryMb || 4096)
  const [jvmArgs, setJvmArgs] = useState((instance.jvmArgs || []).join(' '))
  const [width, setWidth] = useState(instance.width || 1280)
  const [height, setHeight] = useState(instance.height || 720)
  const [icon, setIcon] = useState(instance.icon)
  const [accent, setAccent] = useState(instance.accent)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [batchBusy, setBatchBusy] = useState(false)
  const [crashOpen, setCrashOpen] = useState(false)
  const [flightOpen, setFlightOpen] = useState(false)
  const [copyName, setCopyName] = useState(instance.name + ' 副本')
  const [copying, setCopying] = useState(false)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [importingModpack, setImportingModpack] = useState(false)
  const [installingOptiFine, setInstallingOptiFine] = useState(false)

  const isRunning = running.has(instance.id)
  const isLaunching = launching.has(instance.id)
  const instanceLogs = logs[instance.id] || []
  const instanceTasks = tasks.filter((task) => task.instanceId === instance.id)
  const allSelected = mods.length > 0 && mods.every((mod) => selectedFiles.has(mod.fileName))

  useEffect(() => {
    setName(instance.name)
    setMemory(instance.memoryMb || 4096)
    setJvmArgs((instance.jvmArgs || []).join(' '))
    setWidth(instance.width || 1280)
    setHeight(instance.height || 720)
    setIcon(instance.icon)
    setAccent(instance.accent)
    setSelectedFiles(new Set())
    setCopyName(instance.name + ' 副本')
  }, [instance.id, instance.name, instance.memoryMb, instance.icon, instance.accent])

  useEffect(() => {
    let active = true
    setModsLoading(true)
    setModsError('')
    void window.fangjie.instanceMods(instance.id).then((result) => {
      if (!active) return
      setModsLoading(false)
      if (!result.ok) {
        setModsError(result.error)
        return
      }
      setMods(result.value)
    })
    return () => {
      active = false
    }
  }, [instance.id])

  useEffect(() => {
    if (tab !== 'mods') return
    void window.fangjie.instanceMods(instance.id).then((result) => {
      if (result.ok) setMods(result.value)
    })
  }, [instance.id, tab, instance.mods.length])

  const toggleMod = async (mod: InstalledMod): Promise<void> => {
    setBusyFile(mod.fileName)
    const result = await window.fangjie.setModEnabled(instance.id, mod.fileName, !mod.enabled)
    setBusyFile('')
    if (!result.ok) {
      toast(result.error, 'error')
      return
    }
    setMods(result.value)
    toast(mod.enabled ? `已禁用 ${mod.title}` : `已启用 ${mod.title}`, 'success')
  }

  const removeMod = async (mod: InstalledMod): Promise<void> => {
    const approved = await confirm({
      title: `移除「${mod.title}」？`,
      description: '模组文件会从此实例中删除，不会影响其它实例。',
      confirmLabel: '移除模组',
      danger: true
    })
    if (!approved) return
    setBusyFile(mod.fileName)
    const result = await window.fangjie.removeMod(instance.id, mod.fileName)
    setBusyFile('')
    if (!result.ok) {
      toast(result.error, 'error')
      return
    }
    setMods(result.value)
    await refresh()
    toast('模组已移除', 'success')
  }

  const batchToggle = async (enabled: boolean): Promise<void> => {
    if (!selectedFiles.size) return
    setBatchBusy(true)
    const result = await window.fangjie.setModsEnabledBatch(instance.id, [...selectedFiles], enabled)
    setBatchBusy(false)
    if (!result.ok) {
      toast(result.error, 'error')
      return
    }
    setMods(result.value)
    setSelectedFiles(new Set())
    toast(enabled ? '所选模组已启用' : '所选模组已禁用', 'success')
  }

  const reloadMods = async (): Promise<void> => {
    const result = await window.fangjie.instanceMods(instance.id)
    if (result.ok) setMods(result.value)
    await refresh()
  }

  const copyCurrent = async (): Promise<void> => {
    setCopying(true)
    const result = await window.fangjie.copyInstance(instance.id, copyName)
    setCopying(false)
    if (!result.ok) {
      toast(result.error, 'error')
      return
    }
    toast('已复制为「' + result.value.name + '」', 'success')
    await refresh()
    navigate('instances')
  }

  const exportMods = async (): Promise<void> => {
    const result = await window.fangjie.exportModList(instance.id)
    if (!result.ok) {
      toast(result.error, 'error')
      return
    }
    if (result.value) toast('模组列表已导出', 'success')
  }

  const installOptiFine = async (): Promise<void> => {
    const approved = await confirm({
      title: '安装 OptiFine',
      description: '将调用官方 OptiFine installer 的本地安装接口，无需在窗口中点击；安装完成后会自动把生成的 OptiFine profile 绑定到当前实例。需要本机已有 Java 和官方安装器 jar。',
      confirmLabel: '选择安装器',
      cancelLabel: '取消'
    })
    if (!approved) return
    setInstallingOptiFine(true)
    const result = await window.fangjie.installOptiFine(instance.id)
    setInstallingOptiFine(false)
    if (!result.ok) {
      toast(result.error, 'error')
      return
    }
    if (!result.value) return
    toast('OptiFine 已安装并绑定：' + result.value.versionId, 'success')
    await refresh()
  }

  const importModpack = async (): Promise<void> => {
    setImportingModpack(true)
    const result = await window.fangjie.importModpack(instance.id)
    setImportingModpack(false)
    if (!result.ok) {
      toast(result.error, 'error')
      return
    }
    if (!result.value) return
    const report = result.value.report
    toast('已导入 ' + report.downloaded + ' 个文件 / ' + report.overrides + ' 个覆盖文件', 'success')
    await reloadMods()
  }

  const saveTemplate = async (): Promise<void> => {
    setTemplateSaving(true)
    const result = await window.fangjie.saveInstanceTemplate(instance.id)
    setTemplateSaving(false)
    if (!result.ok) {
      toast(result.error, 'error')
      return
    }
    toast('模板「' + result.value.name + '」已保存', 'success')
  }

  const save = async (): Promise<void> => {
    if (!name.trim()) {
      setFormError('实例名称不能为空')
      return
    }
    setSaving(true)
    setFormError('')
    const result = await window.fangjie.updateInstance(instance.id, {
      name: name.trim(),
      memoryMb: memory,
      icon,
      accent,
      jvmArgs: jvmArgs.split(/\s+/).map((arg) => arg.trim()).filter(Boolean),
      width,
      height
    })
    setSaving(false)
    if (!result.ok) {
      setFormError(result.error)
      return
    }
    await refresh()
    toast('实例设置已保存', 'success')
  }

  const openFolder = async (logsOnly = false): Promise<void> => {
    const result = logsOnly
      ? await window.fangjie.openLogsFolder(instance.id)
      : await window.fangjie.openInstanceFolder(instance.id)
    if (!result.ok) toast(result.error, 'error')
  }

  const activeDownload = instanceTasks.find((task) => task.status === 'running')
  const selectedJava =
    boot.java.runtimes.find((runtime) => runtime.source === 'manual') ||
    boot.java.runtimes[0]
  const javaLabel = selectedJava
    ? `Java ${selectedJava.majorVersion} · ${selectedJava.source === 'manual' ? '手动' : '自动'}`
    : '启动时自动检测'

  return (
    <div className="page page--detail">
      <button type="button" className="back-link" onClick={() => navigate('instances')}>
        <ArrowLeft size={15} />
        所有实例
      </button>

      <section
        className="detail-hero"
        style={{ '--detail-accent': instance.accent } as CSSProperties}
      >
        <WorldArt accent={instance.accent} />
        <div className="detail-hero__shade" />
        <div className="detail-hero__content">
          <InstanceEmblem accent={instance.accent} icon={instance.icon} size={86} />
          <div className="detail-hero__meta">
            <div className="detail-hero__kicker">
              <span className="status-dot status-dot--accent" />
              {instance.loader === 'vanilla'
                ? 'VANILLA INSTANCE'
                : `${LOADER_LABEL[instance.loader] || instance.loader} INSTANCE`}
            </div>
            <h1>{instance.name}</h1>
            <div className="detail-hero__tags">
              <Badge tone="accent">Minecraft {instance.mcVersion}</Badge>
              <Badge tone="outline">
                {LOADER_LABEL[instance.loader] || instance.loader}
              </Badge>
              {instance.loaderVersion ? <Badge tone="neutral">Loader {instance.loaderVersion}</Badge> : null}
              {isRunning ? <Badge tone="success">运行中</Badge> : null}
            </div>
          </div>
          <div className="detail-hero__actions">
            <Button
              variant={isRunning ? 'danger' : 'primary'}
              size="lg"
              loading={isLaunching}
              icon={
                isRunning ? <Square size={14} fill="currentColor" /> : <Play size={16} fill="currentColor" />
              }
              onClick={() => void launch(instance.id)}
            >
              {isRunning ? '结束游戏' : isLaunching ? '正在启动' : '启动游戏'}
            </Button>
            <IconButton label="打开实例文件夹" onClick={() => void openFolder()}>
              <FolderOpen size={18} />
            </IconButton>
            <IconButton label="打开日志文件夹" onClick={() => void openFolder(true)}>
              <Terminal size={18} />
            </IconButton>
          </div>
        </div>
      </section>

      {activeDownload ? (
        <div className="detail-task">
          <div>
            <strong>{activeDownload.title}</strong>
            <span>{activeDownload.detail}</span>
          </div>
          <ProgressBar value={activeDownload.progress} compact />
          <strong>{Math.round(activeDownload.progress)}%</strong>
        </div>
      ) : null}

      <section className="detail-stats">
        <div>
          <span className="detail-stats__icon"><Clock3 size={16} /></span>
          <div>
            <span>累计游玩</span>
            <strong>{formatPlaytime(instance.totalPlayTimeMs)}</strong>
          </div>
        </div>
        <div>
          <span className="detail-stats__icon"><Clock3 size={16} /></span>
          <div>
            <span>上次启动</span>
            <strong>{formatRelative(instance.lastPlayedAt)}</strong>
          </div>
        </div>
        <div>
          <span className="detail-stats__icon"><Puzzle size={16} /></span>
          <div>
            <span>已安装模组</span>
            <strong>{mods.length || instance.mods.length} 个</strong>
          </div>
        </div>
        <div>
          <span className="detail-stats__icon"><HardDrive size={16} /></span>
          <div>
            <span>分配内存</span>
            <strong>{((instance.memoryMb || 4096) / 1024).toFixed(1)} GB</strong>
          </div>
        </div>
      </section>

      <div className="detail-tabs" role="tablist" aria-label="实例详情">
        {([
          ['overview', '概览'],
          ['mods', `模组 ${mods.length || instance.mods.length || ''}`.trim()],
          ['settings', '设置']
        ] as Array<[DetailTab, string]>).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={classNames('detail-tab', tab === value && 'is-active')}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
        <div className="detail-tabs__spacer" />
        <Button
          variant="ghost"
          size="sm"
          icon={<Terminal size={15} />}
          onClick={() => setCrashOpen(true)}
        >
          崩溃诊断
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<Cpu size={15} />}
          onClick={() => setFlightOpen(true)}
        >
          性能记录
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<Puzzle size={15} />}
          onClick={() => openMods(instance.id)}
        >
          模组工坊
        </Button>
      </div>

      {tab === 'overview' ? (
        <div className="detail-columns">
          <div className="detail-column">
            <section className="panel detail-panel">
              <div className="panel__header">
                <div>
                  <div className="panel__eyebrow">WORLD</div>
                  <h3>实例信息</h3>
                </div>
                <Badge tone="outline">v{instance.mcVersion}</Badge>
              </div>
              <div className="info-list">
                <InfoRow label="Minecraft 版本" value={instance.mcVersion} />
                <InfoRow
                  label="模组加载器"
                  value={
                    instance.loader === 'vanilla'
                      ? '原版（Vanilla）'
                      : `${LOADER_LABEL[instance.loader] || instance.loader} ${instance.loaderVersion || ''}`.trim()
                  }
                />
                <InfoRow label="版本 ID" value={instance.versionId} />
                <InfoRow label="创建时间" value={formatDate(instance.createdAt)} />
                <InfoRow label="上次启动" value={formatRelative(instance.lastPlayedAt)} />
                <InfoRow label="实例 ID" value={instance.id} mono />
              </div>
            </section>

            <section className="panel detail-panel log-panel">
              <div className="panel__header">
                <div>
                  <div className="panel__eyebrow">CONSOLE</div>
                  <h3>启动日志</h3>
                </div>
                <button type="button" className="text-action" onClick={() => void openFolder(true)}>
                  打开日志文件夹
                </button>
              </div>
              <div className="console">
                {instanceLogs.length ? (
                  instanceLogs.slice(-24).map((line, index) => (
                    <div key={`${line.at}-${index}`} className="console__line">
                      <span>{new Date(line.at).toLocaleTimeString('zh-CN', { hour12: false })}</span>
                      <code>{line.line}</code>
                    </div>
                  ))
                ) : (
                  <div className="console__empty">
                    <Terminal size={22} />
                    <p>启动游戏后，这里会显示控制台输出。</p>
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="detail-column">
            <section className="panel detail-panel">
              <div className="panel__header">
                <div>
                  <div className="panel__eyebrow">MODS</div>
                  <h3>已安装模组</h3>
                </div>
                <Badge tone={mods.length ? 'accent' : 'neutral'}>{mods.length} 个</Badge>
              </div>
              {modsLoading ? (
                <div className="mod-list-loading">
                  <Spinner size={18} />
                  正在读取模组…
                </div>
              ) : mods.length ? (
                <div className="mini-mod-list">
                  {mods.slice(0, 4).map((mod) => (
                    <div key={mod.fileName} className={classNames('mini-mod', !mod.enabled && 'is-disabled')}>
                      {mod.iconUrl ? <img src={mod.iconUrl} alt="" /> : <span className="mini-mod__fallback"><Puzzle size={16} /></span>}
                      <div>
                        <strong>{mod.title}</strong>
                        <span>{mod.versionName || mod.fileName}</span>
                      </div>
                      {mod.enabled ? <Badge tone="success">启用</Badge> : <Badge tone="neutral">禁用</Badge>}
                    </div>
                  ))}
                  {mods.length > 4 ? <div className="mini-mod-more">还有 {mods.length - 4} 个模组</div> : null}
                </div>
              ) : (
                <div className="mini-empty">
                  <Puzzle size={24} />
                  <p>还没有安装模组</p>
                  <Button size="sm" variant="secondary" onClick={() => openMods(instance.id)}>
                    去模组工坊
                  </Button>
                </div>
              )}
              <button type="button" className="text-action" onClick={() => setTab('mods')}>
                管理全部模组
                <ArrowLeft size={14} className="rotate-180" />
              </button>
            </section>

            <section className="panel detail-panel">
              <div className="panel__header">
                <div>
                  <div className="panel__eyebrow">RUNTIME</div>
                  <h3>运行环境</h3>
                </div>
                <Cpu size={18} className="muted-icon" />
              </div>
              <div className="info-list">
                <InfoRow label="Java" value={javaLabel} />
                <InfoRow label="内存分配" value={`${((instance.memoryMb || 4096) / 1024).toFixed(1)} GB`} />
                <InfoRow label="启动器" value={`方界 v${boot.appVersion}`} />
              </div>
              <button type="button" className="text-action" onClick={() => setTab('settings')}>
                调整实例设置
                <ArrowLeft size={14} className="rotate-180" />
              </button>
            </section>
          </div>
        </div>
      ) : null}

      {tab === 'mods' ? (
        <section className="panel mods-management">
          <div className="panel__header">
            <div>
              <div className="panel__eyebrow">MODS</div>
              <h3>已安装模组 <span className="muted">{mods.length}</span></h3>
            </div>
            <div className="panel__actions">
              <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={() => {
                void window.fangjie.instanceMods(instance.id).then((result) => {
                  if (result.ok) setMods(result.value)
                })
              }}>
                刷新
              </Button>
              <Button variant="primary" size="sm" icon={<Puzzle size={15} />} onClick={() => openMods(instance.id)}>
                添加模组
              </Button>
            </div>
          </div>

          {instance.loader !== 'vanilla' && mods.length ? (
            <div className="mod-batch-bar">
              <label className="mod-select-all">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) => {
                    setSelectedFiles(
                      event.target.checked
                        ? new Set(mods.map((mod) => mod.fileName))
                        : new Set()
                    )
                  }}
                />
                全选
              </label>
              <span className="mod-batch-count">{selectedFiles.size} 个已选</span>
              <Button
                size="sm"
                variant="secondary"
                loading={batchBusy}
                disabled={!selectedFiles.size}
                onClick={() => void batchToggle(true)}
              >
                启用所选
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!selectedFiles.size || batchBusy}
                onClick={() => void batchToggle(false)}
              >
                禁用所选
              </Button>
            </div>
          ) : null}

          {instance.loader === 'vanilla' ? (
            <InlineNotice tone="info" title="原版实例">
              这个实例没有安装模组加载器，因此无法加载模组。新建一个 Fabric、Quilt、Forge 或
              NeoForge 实例即可使用模组工坊。
            </InlineNotice>
          ) : modsLoading ? (
            <div className="mod-list-loading">
              <Spinner size={18} /> 正在读取本地模组…
            </div>
          ) : modsError ? (
            <InlineNotice tone="danger" title="模组读取失败">{modsError}</InlineNotice>
          ) : mods.length ? (
            <div className="mod-table">
              <div className="mod-table__head">
                <span>模组</span>
                <span>版本</span>
                <span>状态</span>
                <span />
              </div>
              {mods.map((mod) => (
                <div className={classNames('mod-row', !mod.enabled && 'is-disabled')} key={mod.fileName}>
                  <div className={classNames('mod-row__identity', selectedFiles.has(mod.fileName) && 'is-selected')}>
                    <input
                      type="checkbox"
                      className="mod-select__input"
                      checked={selectedFiles.has(mod.fileName)}
                      onChange={(event) => {
                        setSelectedFiles((current) => {
                          const next = new Set(current)
                          if (event.target.checked) next.add(mod.fileName)
                          else next.delete(mod.fileName)
                          return next
                        })
                      }}
                      aria-label={`选择 ${mod.title}`}
                      disabled={batchBusy}
                    />
                    {mod.iconUrl ? (
                      <img src={mod.iconUrl} alt="" />
                    ) : (
                      <span className="mod-row__fallback"><Puzzle size={17} /></span>
                    )}
                    <div>
                      <strong>{mod.title}</strong>
                      <span>{mod.projectId.startsWith('local:') ? '本地模组' : mod.fileName}</span>
                    </div>
                  </div>
                  <span className="mod-row__version">{mod.versionName || '—'}</span>
                  <div className="mod-row__toggle">
                    <Toggle
                      checked={mod.enabled}
                      onChange={() => void toggleMod(mod)}
                      label={`${mod.enabled ? '禁用' : '启用'} ${mod.title}`}
                      disabled={busyFile === mod.fileName}
                    />
                  </div>
                  <IconButton
                    label={`移除 ${mod.title}`}
                    size="sm"
                    tone="danger"
                    disabled={busyFile === mod.fileName}
                    onClick={() => void removeMod(mod)}
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-inline">
              <Puzzle size={28} />
              <h4>这个实例还没有模组</h4>
              <p>去模组工坊挑选一些兼容的 Modrinth 项目，前置会自动安装。</p>
              <Button variant="primary" size="sm" onClick={() => openMods(instance.id)}>
                浏览模组
              </Button>
            </div>
          )}
        </section>
      ) : null}

      {tab === 'settings' ? (
        <div className="settings-grid">
          <section className="panel detail-panel">
            <div className="panel__header">
              <div>
                <div className="panel__eyebrow">GENERAL</div>
                <h3>基本信息</h3>
              </div>
              <Settings2 size={18} className="muted-icon" />
            </div>
            <div className="settings-form">
              <Field label="实例名称" htmlFor="detail-name" hint={`${name.length}/32`}>
                <TextInput
                  id="detail-name"
                  value={name}
                  maxLength={32}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field label="额外 JVM 参数" hint="空格分隔，留空使用默认值">
                <TextInput
                  value={jvmArgs}
                  onChange={(event) => setJvmArgs(event.target.value)}
                  placeholder="-XX:+UseG1GC -XX:+ParallelRefProcEnabled"
                />
              </Field>
              <div className="dimension-grid">
                <Field label="窗口宽度">
                  <TextInput
                    type="number"
                    min={320}
                    max={7680}
                    value={width}
                    onChange={(event) => setWidth(Number(event.target.value))}
                  />
                </Field>
                <Field label="窗口高度">
                  <TextInput
                    type="number"
                    min={240}
                    max={4320}
                    value={height}
                    onChange={(event) => setHeight(Number(event.target.value))}
                  />
                </Field>
              </div>
              <Field label="内存分配" hint={`${(memory / 1024).toFixed(1)} GB`}>
                <input
                  type="range"
                  min={1024}
                  max={16384}
                  step={512}
                  value={memory}
                  className="range"
                  style={{ '--range-progress': rangeProgress(memory, 1024, 16384) } as CSSProperties}
                  onChange={(event) => setMemory(Number(event.target.value))}
                  aria-label="实例内存分配"
                />
              </Field>
              <div className="field">
                <div className="field__label-row">
                  <span className="field__label">图标与颜色</span>
                </div>
                <div className="detail-customize">
                  <div className="icon-picker">
                    {INSTANCE_ICONS.map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={classNames('icon-picker__item', icon === item && 'is-selected')}
                        onClick={() => setIcon(item)}
                        aria-label={INSTANCE_ICON_LABELS[item]}
                        aria-pressed={icon === item}
                      >
                        <InstanceEmblem accent={accent} icon={item} size={34} />
                      </button>
                    ))}
                  </div>
                  <div className="accent-picker">
                    {INSTANCE_ACCENTS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={classNames('accent-picker__item', accent === color && 'is-selected')}
                        style={{ background: color }}
                        onClick={() => setAccent(color)}
                        aria-label={`选择颜色 ${color}`}
                        aria-pressed={accent === color}
                      />
                    ))}
                  </div>
                </div>
              </div>
              {formError ? <InlineNotice tone="danger">{formError}</InlineNotice> : null}
              <div className="settings-form__actions">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setName(instance.name)
                    setMemory(instance.memoryMb || 4096)
                    setJvmArgs((instance.jvmArgs || []).join(' '))
                    setWidth(instance.width || 1280)
                    setHeight(instance.height || 720)
                    setIcon(instance.icon)
                    setAccent(instance.accent)
                    setFormError('')
                  }}
                >
                  重置
                </Button>
                <Button variant="primary" loading={saving} onClick={() => void save()} icon={<Check size={16} />}>
                  保存更改
                </Button>
              </div>
            </div>
          </section>

          <div className="detail-column">
            <section className="panel detail-panel">
              <div className="panel__header">
                <div>
                  <div className="panel__eyebrow">MAINTENANCE</div>
                  <h3>文件与维护</h3>
                </div>
              </div>
              <div className="button-stack">
                <Button variant="secondary" icon={<FolderOpen size={16} />} onClick={() => void openFolder()}>
                  打开实例文件夹
                </Button>
                <Button variant="secondary" icon={<Terminal size={16} />} onClick={() => void openFolder(true)}>
                  打开日志文件夹
                </Button>
                <Button variant="secondary" icon={<Puzzle size={16} />} onClick={() => openMods(instance.id)}>
                  管理模组
                </Button>
                <Button variant="secondary" icon={<Download size={16} />} onClick={() => void exportMods()}>
                  导出模组列表
                </Button>
                <Button
                  variant="secondary"
                  icon={<Download size={16} />}
                  loading={importingModpack}
                  onClick={() => void importModpack()}
                >
                  导入 .mrpack / .zip
                </Button>
                <Button
                  variant="secondary"
                  icon={<Cpu size={16} />}
                  loading={installingOptiFine}
                  onClick={() => void installOptiFine()}
                >
                  安装 OptiFine
                </Button>
              </div>
            </section>

            <section className="panel detail-panel">
              <div className="panel__header">
                <div>
                  <div className="panel__eyebrow">TEMPLATE & COPY</div>
                  <h3>复制与模板</h3>
                </div>
                <Copy size={18} className="muted-icon" />
              </div>
              <div className="settings-form">
                <Field label="副本名称" htmlFor="copy-name" hint="源实例不会被修改">
                  <TextInput
                    id="copy-name"
                    value={copyName}
                    maxLength={32}
                    onChange={(event) => setCopyName(event.target.value)}
                  />
                </Field>
                <div className="settings-form__actions">
                  <Button
                    variant="secondary"
                    icon={<Copy size={15} />}
                    loading={copying}
                    disabled={isRunning || !copyName.trim()}
                    onClick={() => void copyCurrent()}
                  >
                    复制实例
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<Bookmark size={15} />}
                    loading={templateSaving}
                    onClick={() => void saveTemplate()}
                  >
                    保存为模板
                  </Button>
                </div>
                <p className="settings-hint">
                  复制会深拷贝存档、模组和配置，新实例拥有独立目录；模板保存 JVM 参数、模组文件名、内存与分辨率，当前不会覆盖已有实例。
                </p>
              </div>
            </section>

            <section className="panel detail-panel danger-panel">
              <div className="panel__header">
                <div>
                  <div className="panel__eyebrow">DANGER</div>
                  <h3>危险操作</h3>
                </div>
                <Trash2 size={18} />
              </div>
              <p className="muted-copy">
                删除实例会一并移除存档、模组与日志。共享的游戏版本和 Java 运行时会保留。
              </p>
              <Button
                variant="danger"
                icon={<Trash2 size={16} />}
                disabled={isRunning}
                onClick={() => void requestDeleteInstance(instance.id)}
              >
                {isRunning ? '游戏运行时无法删除' : '删除这个实例'}
              </Button>
            </section>
          </div>
        </div>
      ) : null}

      <CrashDiagnosticsModal
        open={crashOpen}
        instance={instance}
        onClose={() => setCrashOpen(false)}
        onChanged={() => { void reloadMods() }}
      />
      <FlightRecorderModal
        open={flightOpen}
        instance={instance}
        onClose={() => setFlightOpen(false)}
      />
    </div>
  )
}

function InfoRow({
  label,
  value,
  mono = false
}: {
  label: string
  value: string
  mono?: boolean
}): React.JSX.Element {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong className={mono ? 'mono' : undefined} title={value}>{value}</strong>
    </div>
  )
}
