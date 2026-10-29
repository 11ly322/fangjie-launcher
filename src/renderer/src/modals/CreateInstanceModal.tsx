import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  Box,
  Check,
  Hammer,
  Layers,
  Puzzle,
  RefreshCw,
  Zap
} from 'lucide-react'
import type { LoaderType, VersionSummary } from '../../../shared/types'
import {
  INSTANCE_ACCENTS,
  INSTANCE_ICONS,
  LOADER_DESCRIPTIONS,
  LOADER_LABEL
} from '../../../shared/constants'
import { InstanceEmblem } from '../components/Artwork'
import {
  Badge,
  Button,
  Field,
  InlineNotice,
  Modal,
  Select,
  Skeleton,
  TextInput
} from '../components/ui'
import { useLauncher } from '../state/LauncherContext'
import { classNames, formatDate, formatVersionType, rangeProgress } from '../lib/format'

const ICON_LABELS: Record<string, string> = {
  pickaxe: '生存',
  trees: '自然',
  castle: '建筑',
  compass: '探索',
  gem: '冒险',
  mountain: '风景',
  home: '家园',
  sword: '战斗'
}

const LOADER_OPTIONS: Array<{
  id: LoaderType
  label: string
  icon: React.ReactNode
  badge?: string
}> = [
  { id: 'fabric', label: 'Fabric', icon: <Puzzle size={19} />, badge: '推荐' },
  { id: 'quilt', label: 'Quilt', icon: <Layers size={19} /> },
  { id: 'forge', label: 'Forge', icon: <Hammer size={19} /> },
  { id: 'neoforge', label: 'NeoForge', icon: <Zap size={19} /> },
  { id: 'vanilla', label: '原版游戏', icon: <Box size={19} /> }
]

export function CreateInstanceModal({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}): React.JSX.Element {
  const { boot, toast, navigate, refresh } = useLauncher()
  const [versions, setVersions] = useState<VersionSummary[]>([])
  const [latest, setLatest] = useState<{ release?: string; snapshot?: string }>({})
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [versionError, setVersionError] = useState('')
  const [showSnapshots, setShowSnapshots] = useState(boot.settings.showSnapshots)
  const [versionQuery, setVersionQuery] = useState('')
  const [version, setVersion] = useState('')
  const [name, setName] = useState('生存世界')
  const [loader, setLoader] = useState<LoaderType>('fabric')
  const [memoryMb, setMemoryMb] = useState(boot.settings.memoryMb)
  const [icon, setIcon] = useState('trees')
  const [accent, setAccent] = useState<string>(INSTANCE_ACCENTS[0])
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState('')

  const loadVersions = async (includeSnapshots: boolean): Promise<void> => {
    setLoadingVersions(true)
    setVersionError('')
    const result = await window.fangjie.versions(includeSnapshots)
    setLoadingVersions(false)
    if (!result.ok) {
      setVersionError(result.error)
      return
    }
    setVersions(result.value.versions)
    setLatest(result.value.latest)
    setVersion((current) => {
      if (current && result.value.versions.some((item) => item.id === current)) return current
      return result.value.latest.release || result.value.versions[0]?.id || ''
    })
  }

  useEffect(() => {
    if (!open) return
    setName('生存世界')
    setLoader('fabric')
    setMemoryMb(boot.settings.memoryMb)
    setIcon(INSTANCE_ICONS[Math.floor(Math.random() * INSTANCE_ICONS.length)])
    setAccent(INSTANCE_ACCENTS[Math.floor(Math.random() * INSTANCE_ACCENTS.length)])
    setVersion('')
    setVersionQuery('')
    setFormError('')
    setCreating(false)
    setShowSnapshots(boot.settings.showSnapshots)
    void loadVersions(boot.settings.showSnapshots)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const quickVersions = useMemo(
    () => versions.filter((item) => item.type === 'release').slice(0, 3),
    [versions]
  )

  const filteredVersions = useMemo(() => {
    const query = versionQuery.trim().toLowerCase()
    const base = versions.filter((item) => item.type === 'release' || showSnapshots)
    if (!query) return base
    return base.filter(
      (item) =>
        item.id.toLowerCase().includes(query) || formatVersionType(item.type).includes(query)
    )
  }, [versions, showSnapshots, versionQuery])

  const selectedVersion = versions.find((item) => item.id === version)

  const submit = async (): Promise<void> => {
    const cleaned = name.trim().replace(/\s+/g, ' ')
    if (!cleaned) {
      setFormError('给这个实例起一个名字吧')
      return
    }
    if (!version) {
      setFormError('请选择一个 Minecraft 版本')
      return
    }
    setCreating(true)
    setFormError('')
    const result = await window.fangjie.createInstance({
      name: cleaned,
      mcVersion: version,
      loader,
      memoryMb,
      icon,
      accent
    })
    setCreating(false)
    if (!result.ok) {
      setFormError(result.error)
      return
    }
    await refresh()
    toast('实例安装已开始，可以在下载中心查看进度', 'success')
    onClose()
    navigate('downloads')
  }

  return (
    <Modal
      open={open}
      onClose={creating ? () => undefined : onClose}
      title="创建游戏实例"
      description="下载官方游戏文件，并准备一个独立的存档与模组空间"
      size="lg"
      dismissible={!creating}
      className="create-modal"
      footer={
        <>
          <div className="create-modal__footer-hint">
            {loader !== 'vanilla'
              ? `包含 ${LOADER_LABEL[loader]} 加载器与 Java 运行时`
              : '包含原版游戏与 Java 运行时'}
          </div>
          <Button variant="ghost" onClick={onClose} disabled={creating}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            loading={creating}
            disabled={loadingVersions || Boolean(versionError)}
            icon={<Box size={16} />}
          >
            创建并安装
          </Button>
        </>
      }
    >
      <div className="create-layout">
        <div className="create-main">
          <div className="create-preview">
            <InstanceEmblem accent={accent} icon={icon} size={72} />
            <div className="create-preview__meta">
              <div className="create-preview__name">{name.trim() || '未命名实例'}</div>
              <div className="create-preview__tags">
                <Badge tone="outline">Minecraft {version || '—'}</Badge>
                <Badge tone={loader !== 'vanilla' ? 'accent' : 'neutral'}>
                  {LOADER_LABEL[loader]}
                </Badge>
              </div>
            </div>
            <div className="create-preview__memory">
              <strong>{(memoryMb / 1024).toFixed(1)}</strong>
              <span>GB 内存</span>
            </div>
          </div>

          <Field label="实例名称" htmlFor="instance-name" hint={`${name.length}/32`}>
            <TextInput
              id="instance-name"
              value={name}
              maxLength={32}
              placeholder="例如：周末生存"
              onChange={(event) => setName(event.target.value)}
            />
          </Field>

          <Field
            label="游戏版本"
            hint={
              selectedVersion ? (
                <span>{formatDate(selectedVersion.releaseTime)} 发布</span>
              ) : undefined
            }
          >
            {loadingVersions ? (
              <div className="version-skeletons">
                <Skeleton style={{ height: 58 }} />
                <Skeleton style={{ height: 58 }} />
                <Skeleton style={{ height: 58 }} />
              </div>
            ) : versionError ? (
              <InlineNotice
                tone="danger"
                title="版本列表加载失败"
                action={
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<RefreshCw size={14} />}
                    onClick={() => void loadVersions(showSnapshots)}
                  >
                    重试
                  </Button>
                }
              >
                {versionError}
              </InlineNotice>
            ) : (
              <>
                <div className="version-quick">
                  {quickVersions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={classNames('version-chip', version === item.id && 'is-selected')}
                      onClick={() => setVersion(item.id)}
                    >
                      <span>{item.id}</span>
                      <small>{item.id === latest.release ? '最新正式版' : formatVersionType(item.type)}</small>
                      {version === item.id ? <Check size={14} /> : null}
                    </button>
                  ))}
                </div>
                <div className="version-select-row">
                  <TextInput
                    value={versionQuery}
                    onChange={(event) => setVersionQuery(event.target.value)}
                    placeholder="筛选版本，例如 1.20.1"
                    aria-label="筛选游戏版本"
                  />
                  <Select
                    value={version}
                    onChange={(event) => setVersion(event.target.value)}
                    aria-label="选择 Minecraft 版本"
                  >
                    {!filteredVersions.some((item) => item.id === version) && version ? (
                      <option value={version}>
                        {version} · {selectedVersion ? formatVersionType(selectedVersion.type) : ''}
                      </option>
                    ) : null}
                    {filteredVersions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.id} · {formatVersionType(item.type)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="version-footnote">
                  <label className="checkbox-line">
                    <input
                      type="checkbox"
                      checked={showSnapshots}
                      onChange={(event) => {
                        setShowSnapshots(event.target.checked)
                        void loadVersions(event.target.checked)
                      }}
                    />
                    <span>显示快照版本</span>
                  </label>
                  <span>{filteredVersions.length} 个版本可选</span>
                </div>
              </>
            )}
          </Field>

          <Field label="模组加载器" hint="创建后不可更改">
            <div className="loader-grid loader-grid--five">
              {LOADER_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={classNames(
                    'loader-option',
                    loader === option.id && 'is-selected',
                    option.id === 'vanilla' && 'loader-option--vanilla'
                  )}
                  onClick={() => setLoader(option.id)}
                  aria-pressed={loader === option.id}
                >
                  <span
                    className={classNames(
                      'loader-option__icon',
                      option.id !== 'vanilla' && 'loader-option__icon--fabric'
                    )}
                  >
                    {option.icon}
                  </span>
                  <span className="loader-option__body">
                    <strong>
                      {option.label}
                      {option.badge ? <Badge tone="accent">{option.badge}</Badge> : null}
                    </strong>
                    <span>{LOADER_DESCRIPTIONS[option.id]}</span>
                  </span>
                  <span className="radio-dot">{loader === option.id ? <span /> : null}</span>
                </button>
              ))}
            </div>
          </Field>

          <Field label="分配内存" hint={`${(memoryMb / 1024).toFixed(1)} GB`}>
            <div className="range-row">
              <input
                type="range"
                min={1024}
                max={Math.min(16384, 32768)}
                step={512}
                value={memoryMb}
                onChange={(event) => setMemoryMb(Number(event.target.value))}
                className="range"
                style={{ '--range-progress': rangeProgress(memoryMb, 1024, 16384) } as CSSProperties}
                aria-label="分配内存"
              />
              <div className="range-marks">
                <span>1 GB</span>
                <span>建议 4–8 GB</span>
                <span>16 GB</span>
              </div>
            </div>
          </Field>

          {formError ? (
            <InlineNotice tone="danger" title="无法创建实例">
              {formError}
            </InlineNotice>
          ) : null}
        </div>

        <aside className="create-side">
          <div className="create-side__section">
            <div className="create-side__label">实例图标</div>
            <div className="icon-picker">
              {INSTANCE_ICONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={classNames('icon-picker__item', icon === item && 'is-selected')}
                  onClick={() => setIcon(item)}
                  title={ICON_LABELS[item]}
                  aria-label={ICON_LABELS[item]}
                  aria-pressed={icon === item}
                >
                  <InstanceEmblem accent={accent} icon={item} size={34} />
                </button>
              ))}
            </div>
          </div>
          <div className="create-side__section">
            <div className="create-side__label">强调色</div>
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

          <div className="create-side__info">
            <strong>会下载什么？</strong>
            <ul>
              <li>Minecraft {version || '游戏'} 核心文件</li>
              <li>运行库与游戏资源</li>
              {loader !== 'vanilla' ? <li>{LOADER_LABEL[loader]} 加载器与依赖</li> : null}
              <li>匹配版本的 Java 运行时</li>
            </ul>
            <p>首次安装需要联网，文件会与其它实例共享，不会重复占空间。</p>
          </div>
        </aside>
      </div>
    </Modal>
  )
}
