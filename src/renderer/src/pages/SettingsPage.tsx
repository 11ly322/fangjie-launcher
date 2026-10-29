import { useEffect, useState, type CSSProperties } from 'react'
import {
  Check,
  ChevronRight,
  Cpu,
  Download,
  FolderOpen,
  HardDrive,
  Palette,
  Puzzle,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Network,
  UserRound,
  WifiOff
} from 'lucide-react'
import { useLauncher } from '../state/LauncherContext'
import { PixelAvatar, SkinHead } from '../components/Artwork'
import {
  Badge,
  Button,
  Field,
  InlineNotice,
  StatusDot,
  TextInput,
  ToggleRow
} from '../components/ui'
import { classNames, rangeProgress } from '../lib/format'
import { applyTheme, THEMES } from '../lib/theme'
import type { CoreUpdateCheck, PluginRecord, ThemeId } from '../../../shared/types'

export function SettingsPage(): React.JSX.Element {
  const { boot, confirm, openAccount, refreshJava, saveSettings, toast } = useLauncher()
  const [memoryMb, setMemoryMb] = useState(boot.settings.memoryMb)
  const [javaPath, setJavaPath] = useState(boot.settings.javaPath)
  const [showSnapshots, setShowSnapshots] = useState(boot.settings.showSnapshots)
  const [minimizeOnLaunch, setMinimizeOnLaunch] = useState(boot.settings.minimizeOnLaunch)
  const [proxyUrl, setProxyUrl] = useState(boot.settings.proxyUrl)
  const [modrinthBase, setModrinthBase] = useState(boot.settings.modrinthBase)
  const [curseforgeBase, setCurseforgeBase] = useState(boot.settings.curseforgeBase)
  const [offlineMode, setOfflineMode] = useState(boot.settings.offline)
  const [theme, setTheme] = useState<ThemeId>(boot.settings.theme)
  const [saving, setSaving] = useState(false)
  const [changingData, setChangingData] = useState(false)
  const [update, setUpdate] = useState<CoreUpdateCheck | null>(null)
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState('')
  const [updatePath, setUpdatePath] = useState('')
  const [plugins, setPlugins] = useState<PluginRecord[]>([])
  const [pendingDataPath, setPendingDataPath] = useState(() => {
    try {
      return window.sessionStorage.getItem('fangjie-pending-data') || ''
    } catch {
      return ''
    }
  })
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')

  // Theme is the only setting that saves immediately. Do not resync the
  // other form fields here: that would discard unsaved memory/Java edits when
  // the user previews a different theme.
  useEffect(() => {
    setTheme(boot.settings.theme)
  }, [boot.settings.theme])

  useEffect(() => {
    let active = true
    void window.fangjie.pluginsList().then((result) => {
      if (active && result.ok) setPlugins(result.value)
    })
    return () => {
      active = false
    }
  }, [])

  const dirty =
    memoryMb !== boot.settings.memoryMb ||
    javaPath !== boot.settings.javaPath ||
    showSnapshots !== boot.settings.showSnapshots ||
    minimizeOnLaunch !== boot.settings.minimizeOnLaunch ||
    proxyUrl !== boot.settings.proxyUrl ||
    modrinthBase !== boot.settings.modrinthBase ||
    curseforgeBase !== boot.settings.curseforgeBase

  const save = async (): Promise<void> => {
    setSaving(true)
    setError('')
    const ok = await saveSettings({
      memoryMb,
      javaPath,
      showSnapshots,
      minimizeOnLaunch,
      proxyUrl,
      modrinthBase,
      curseforgeBase
    })
    setSaving(false)
    if (!ok) setError('设置保存失败，请重试')
  }

  const chooseJava = async (): Promise<void> => {
    const result = await window.fangjie.chooseJava()
    if (!result.ok) {
      toast(result.error, 'error')
      return
    }
    if (result.value) {
      setJavaPath(result.value)
      toast('已选择新的 Java，保存后生效', 'info')
    }
  }

  const scan = async (): Promise<void> => {
    setScanning(true)
    await refreshJava()
    setScanning(false)
  }

  const openData = async (): Promise<void> => {
    const result = await window.fangjie.openDataFolder()
    if (!result.ok) toast(result.error, 'error')
  }

  const selectTheme = async (next: ThemeId): Promise<void> => {
    if (next === theme) return
    const previous = theme
    setTheme(next)
    applyTheme(next)
    const ok = await saveSettings({ theme: next })
    if (!ok) {
      setTheme(previous)
      applyTheme(previous)
    }
  }

  const changeDataLocation = async (): Promise<void> => {
    const chosen = await window.fangjie.chooseDataFolder()
    if (!chosen.ok) {
      toast(chosen.error, 'error')
      return
    }
    if (!chosen.value) return
    if (chosen.value === boot.dataPath) {
      toast('这已经是当前数据目录', 'info')
      return
    }
    const accepted = await confirm({
      title: '迁移游戏数据？',
      description: `将把当前数据目录完整复制到：\n${chosen.value}\n\n旧目录不会被删除；迁移完成后需要重启启动器。请确保新目录为空，且没有游戏或下载任务在运行。数据较大时复制可能需要几分钟。`,
      confirmLabel: '迁移并切换',
      cancelLabel: '取消'
    })
    if (!accepted) return
    setChangingData(true)
    const result = await window.fangjie.changeDataLocation(chosen.value)
    setChangingData(false)
    if (!result.ok) {
      toast(result.error, 'error')
      return
    }
    setPendingDataPath(result.value.path)
    try {
      window.sessionStorage.setItem('fangjie-pending-data', result.value.path)
    } catch {
      /* session-only hint */
    }
    toast('数据已迁移，重启启动器后生效', 'success')
  }

  const changeOffline = async (next: boolean): Promise<void> => {
    setOfflineMode(next)
    const ok = await saveSettings({ offline: next })
    if (!ok) setOfflineMode(!next)
  }

  const checkUpdate = async (): Promise<void> => {
    setUpdating(true)
    setUpdateError('')
    setUpdatePath('')
    const result = await window.fangjie.updateCheck()
    setUpdating(false)
    if (!result.ok) {
      setUpdateError(result.error)
      return
    }
    setUpdate(result.value)
  }

  const downloadUpdatePackage = async (): Promise<void> => {
    const asset = update?.available?.assets?.[0]
    if (!asset) return
    setUpdating(true)
    setUpdateError('')
    const result = await window.fangjie.updateDownload(asset)
    setUpdating(false)
    if (!result.ok) {
      setUpdateError(result.error)
      return
    }
    setUpdatePath(result.value)
    toast('更新包已下载并通过校验', 'success')
  }

  const installUpdate = async (): Promise<void> => {
    if (!updatePath) return
    const result = await window.fangjie.updateApply(updatePath)
    if (!result.ok) setUpdateError(result.error)
  }

  const openPlugins = async (): Promise<void> => {
    const result = await window.fangjie.openPluginsFolder()
    if (!result.ok) toast(result.error, 'error')
  }

  const restart = async (): Promise<void> => {
    const result = await window.fangjie.restartApp()
    if (!result.ok) toast(result.error, 'error')
  }

  const currentJava = boot.java.runtimes.find((runtime) => runtime.path === javaPath)
  const automaticJava = boot.java.runtimes.find((runtime) => runtime.source === 'auto')
  const effectiveJava = javaPath ? currentJava : automaticJava

  return (
    <div className="page page--settings">
      <header className="page-header">
        <div>
          <div className="eyebrow">PREFERENCES</div>
          <h1>设置</h1>
          <p>调整账户、外观、Java 与启动行为。主题立即生效，其余更改在点击保存后写入本地配置。</p>
        </div>
        <div className="page-header__actions">
          {dirty ? <Badge tone="warn">有未保存的更改</Badge> : null}
          <Button
            variant="primary"
            icon={<Check size={16} />}
            loading={saving}
            disabled={!dirty}
            onClick={() => void save()}
          >
            保存设置
          </Button>
        </div>
      </header>

      {error ? <InlineNotice tone="danger" title="保存失败">{error}</InlineNotice> : null}

      <div className="settings-layout">
        <section className="settings-section">
          <div className="settings-section__heading">
            <div className="settings-section__icon">
              <UserRound size={18} />
            </div>
            <div>
              <h2>玩家档案</h2>
              <p>启动游戏时使用的离线身份</p>
            </div>
          </div>
          <div className="settings-card">
            <div className="settings-account">
              {boot.account.type === 'offline' && boot.account.skin?.dataUrl ? (
                <SkinHead dataUrl={boot.account.skin.dataUrl} size={56} />
              ) : (
                <PixelAvatar name={boot.account.name} size={56} />
              )}
              <div>
                <strong>{boot.account.name}</strong>
                <span className="settings-account__meta">
                  <Badge tone={boot.account.type === 'microsoft' ? 'success' : 'outline'}>
                    <ShieldCheck size={12} />
                    {boot.account.type === 'microsoft' ? 'Microsoft 正版' : '离线档案'}
                  </Badge>
                  <span className="mono">{boot.account.uuid}</span>
                </span>
              </div>
              <Button variant="secondary" size="sm" onClick={openAccount}>
                编辑档案
              </Button>
            </div>
            <p className="settings-hint">
              {boot.account.type === 'microsoft'
                ? '正版账户通过 Microsoft 登录，可使用在线验证与 Mojang 皮肤。登录令牌只保存在本机。'
                : '离线档案不连接 Mojang 登录，适合单机与离线服务器。需要正版验证的服务器无法加入。'}
            </p>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__heading">
            <div className="settings-section__icon">
              <Cpu size={18} />
            </div>
            <div>
              <h2>Java 运行时</h2>
              <p>安装实例时自动准备，也可以手动指定</p>
            </div>
            <div className="settings-section__actions">
              <Button
                size="sm"
                variant="ghost"
                icon={<RefreshCw size={14} className={scanning ? 'spin' : undefined} />}
                onClick={() => void scan()}
                disabled={scanning}
              >
                重新扫描
              </Button>
            </div>
          </div>
          <div className="settings-card">
            <div className="java-status">
              <span className={classNames('java-status__icon', !effectiveJava && 'is-empty')}>
                <Cpu size={20} />
              </span>
              <div>
                <div className="java-status__title">
                  {effectiveJava ? `Java ${effectiveJava.majorVersion}` : '尚未检测到 Java 运行时'}
                  {javaPath ? <Badge tone="outline">手动指定</Badge> : <Badge tone="accent">自动选择</Badge>}
                </div>
                <div className="java-status__path" title={javaPath || effectiveJava?.path || ''}>
                  {javaPath || effectiveJava?.path || '首次安装实例时会自动下载匹配的 Java'}
                </div>
              </div>
              <div className="java-status__actions">
                <Button size="sm" variant="secondary" onClick={() => void chooseJava()}>
                  选择 Java
                </Button>
                {javaPath ? (
                  <Button size="sm" variant="ghost" onClick={() => setJavaPath('')}>
                    恢复自动
                  </Button>
                ) : null}
              </div>
            </div>

            {boot.java.runtimes.length ? (
              <div className="java-list">
                <div className="java-list__heading">已检测到的运行时</div>
                {boot.java.runtimes.map((runtime) => (
                  <div className="java-list__row" key={runtime.path}>
                    <StatusDot tone={runtime.source === 'manual' ? 'accent' : 'success'} />
                    <div>
                      <strong>Java {runtime.majorVersion}</strong>
                      <span>{runtime.version}</span>
                    </div>
                    <code title={runtime.path}>{runtime.path}</code>
                    {runtime.source === 'manual' ? <Badge tone="outline">手动</Badge> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="java-empty">
                还没有可用的运行时。创建实例时会自动从 Mojang 下载，或者你也可以手动选择已安装的
                <code>javaw.exe</code>。
              </div>
            )}
            <p className="settings-hint">
              手动指定的 Java 会优先用于所有实例。部分旧版本需要 Java 8，新版本通常需要 Java 17 或 21。
            </p>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__heading">
            <div className="settings-section__icon">
              <SlidersHorizontal size={18} />
            </div>
            <div>
              <h2>性能与启动</h2>
              <p>控制默认内存与窗口行为</p>
            </div>
          </div>
          <div className="settings-card">
            <Field
              label="默认内存分配"
              hint={`${(memoryMb / 1024).toFixed(1)} GB`}
            >
              <div className="range-row">
                <input
                  type="range"
                  min={1024}
                  max={16384}
                  step={512}
                  value={Math.min(16384, memoryMb)}
                  className="range"
                  style={{ '--range-progress': rangeProgress(memoryMb, 1024, 16384) } as CSSProperties}
                  onChange={(event) => setMemoryMb(Number(event.target.value))}
                  aria-label="默认内存分配"
                />
                <div className="range-marks">
                  <span>1 GB</span>
                  <span>建议 4–8 GB</span>
                  <span>16 GB</span>
                </div>
              </div>
            </Field>
            <p className="settings-hint">
              新建实例会使用这个默认值。每个实例可以在实例详情中单独调整。
            </p>
            <div className="setting-divider" />
            <ToggleRow
              title="启动游戏后最小化启动器"
              description="给游戏窗口让出空间，适合单人游玩。"
              checked={minimizeOnLaunch}
              onChange={setMinimizeOnLaunch}
            />
            <div className="setting-divider" />
            <ToggleRow
              title="创建实例时显示快照版本"
              description="在版本列表中默认包含 Minecraft 预览快照，可能不稳定。"
              checked={showSnapshots}
              onChange={setShowSnapshots}
            />
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__heading">
            <div className="settings-section__icon">
              <Palette size={18} />
            </div>
            <div>
              <h2>外观主题</h2>
              <p>三套配色，立即生效并记住选择</p>
            </div>
          </div>
          <div className="settings-card">
            <div className="theme-options" role="group" aria-label="选择外观主题">
              {THEMES.map((option) => {
                const selected = option.id === theme
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={classNames('theme-option', selected && 'is-selected')}
                    aria-pressed={selected}
                    onClick={() => void selectTheme(option.id)}
                  >
                    <span
                      className="theme-option__preview"
                      style={{ background: option.background }}
                      aria-hidden="true"
                    >
                      <span className="theme-option__glow" style={{ background: option.accent }} />
                      <span className="theme-option__rail" style={{ background: option.accent }} />
                      <span className="theme-option__panel" />
                    </span>
                    <span className="theme-option__copy">
                      <strong>{option.name}</strong>
                      <small>{option.description}</small>
                    </span>
                    {selected ? (
                      <span className="theme-option__check" aria-hidden="true">
                        <Check size={13} />
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
            <p className="settings-hint">
              主题只改变方界的配色，不会影响游戏画面。选择后会立即写入本地配置；下次启动也会保持。
            </p>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__heading">
            <div className="settings-section__icon">
              <Network size={18} />
            </div>
            <div>
              <h2>网络与镜像</h2>
              <p>代理、Modrinth 与 CurseForge API 基址</p>
            </div>
          </div>
          <div className="settings-card">
            <Field label="HTTP(S) 代理" htmlFor="proxy-url" hint="留空直连；例如 http://127.0.0.1:7890">
              <TextInput id="proxy-url" value={proxyUrl} onChange={(event) => setProxyUrl(event.target.value)} placeholder="http://127.0.0.1:7890" />
            </Field>
            <div className="setting-divider" />
            <Field label="Modrinth API" htmlFor="modrinth-base" hint="可替换为兼容镜像基址">
              <TextInput id="modrinth-base" value={modrinthBase} onChange={(event) => setModrinthBase(event.target.value)} />
            </Field>
            <Field label="CurseForge API" htmlFor="curseforge-base" hint="默认 MCIM 公共镜像">
              <TextInput id="curseforge-base" value={curseforgeBase} onChange={(event) => setCurseforgeBase(event.target.value)} />
            </Field>
            <p className="settings-hint">
              代理作用于 Node fetch / xmcl 下载器；镜像基址需兼容对应 API。离线模式优先于这些设置。
            </p>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__heading">
            <div className="settings-section__icon">
              <HardDrive size={18} />
            </div>
            <div>
              <h2>存储位置</h2>
              <p>游戏文件、共享版本与 Java 运行库</p>
            </div>
          </div>
          <div className="settings-card">
            <div className="path-box">
              <div>
                <span>游戏数据目录</span>
                <strong title={boot.dataPath}>{boot.dataPath}</strong>
              </div>
              <div className="path-box__actions">
                <Button variant="secondary" size="sm" icon={<FolderOpen size={14} />} onClick={() => void openData()}>
                  打开
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={changingData}
                  disabled={Boolean(pendingDataPath)}
                  onClick={() => void changeDataLocation()}
                >
                  更改位置
                </Button>
              </div>
            </div>
            <div className="path-box">
              <div>
                <span>配置文件</span>
                <strong title={boot.configPath}>{boot.configPath}</strong>
              </div>
            </div>
            {pendingDataPath ? (
              <div className="data-location-notice">
                <InlineNotice
                  tone="success"
                  title="数据目录已迁移"
                  action={
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<RefreshCw size={14} />}
                      onClick={() => void restart()}
                    >
                      立即重启
                    </Button>
                  }
                >
                  下次启动将从 <code title={pendingDataPath}>{pendingDataPath}</code> 读取数据。旧目录没有删除，确认新目录正常后可手动清理。
                </InlineNotice>
              </div>
            ) : null}
            <p className="settings-hint">
              每个实例的存档与模组位于 <code>instances/&lt;实例ID&gt;/.minecraft</code>，游戏版本与运行库在实例之间共享。更改位置会完整复制当前数据，旧目录保留。
            </p>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__heading">
            <div className="settings-section__icon">
              <WifiOff size={18} />
            </div>
            <div>
              <h2>离线模式</h2>
              <p>阻止非必要的网络请求</p>
            </div>
          </div>
          <div className="settings-card">
            <ToggleRow
              title="完全离线模式"
              description="阻止版本元数据、模组、资源包、更新、Microsoft 登录与联机请求；已有本地文件仍可启动。"
              checked={offlineMode}
              onChange={(value) => void changeOffline(value)}
            />
            <p className="settings-hint">
              离线模式是全局开关，立即写入配置。关闭后恢复正常网络能力；不会删除已缓存或已安装的文件。
            </p>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__heading">
            <div className="settings-section__icon">
              <Download size={18} />
            </div>
            <div>
              <h2>软件更新</h2>
              <p>从 GitHub Releases 检查安装版更新</p>
            </div>
          </div>
          <div className="settings-card update-panel">
            <div className="update-line">
              <div>
                <span>当前版本</span>
                <strong>v{boot.appVersion}</strong>
              </div>
              <Button
                variant="secondary"
                size="sm"
                icon={<RefreshCw size={14} />}
                loading={updating}
                onClick={() => void checkUpdate()}
              >
                检查更新
              </Button>
            </div>
            {updateError ? <InlineNotice tone="danger" title="更新失败">{updateError}</InlineNotice> : null}
            {update && !update.available ? (
              <InlineNotice tone="success" title="已是最新版本">
                当前 v{update.current_version} 没有更高版本的 Windows 安装包。
              </InlineNotice>
            ) : null}
            {update?.available ? (
              <div className="update-available">
                <div className="update-version">
                  <div>
                    <span>可用版本</span>
                    <strong>v{update.available.version}</strong>
                  </div>
                  <Badge tone="accent">{update.available.channel === 'beta' ? 'Beta' : 'Stable'}</Badge>
                </div>
                {update.available.notes ? (
                  <p className="update-notes">{update.available.notes}</p>
                ) : null}
                <div className="settings-form__actions">
                  <Button
                    variant="primary"
                    icon={<Download size={15} />}
                    loading={updating}
                    onClick={() => void downloadUpdatePackage()}
                  >
                    下载更新
                  </Button>
                  {updatePath ? (
                    <Button variant="secondary" onClick={() => void installUpdate()}>
                      安装并重启
                    </Button>
                  ) : null}
                </div>
                {updatePath ? <code className="update-path" title={updatePath}>{updatePath}</code> : null}
              </div>
            ) : null}
            <p className="settings-hint">
              默认从 GitHub Releases 获取安装包；下载后由 Rust 核心校验大小与 SHA256。自动替换目前只支持安装版 .exe，便携版请手动替换。
            </p>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__heading">
            <div className="settings-section__icon">
              <Puzzle size={18} />
            </div>
            <div>
              <h2>插件</h2>
              <p>版本与权限声明的本地清单</p>
            </div>
            <div className="settings-section__actions">
              <Button size="sm" variant="ghost" icon={<FolderOpen size={14} />} onClick={() => void openPlugins()}>
                打开目录
              </Button>
            </div>
          </div>
          <div className="settings-card">
            {plugins.length ? (
              <div className="plugin-list">
                {plugins.map((plugin) => (
                  <div className="plugin-row" key={plugin.directory}>
                    <div>
                      <strong>{plugin.manifest?.name || plugin.directory}</strong>
                      <span>
                        {plugin.manifest ? 'v' + plugin.manifest.version + ' · API ' + plugin.manifest.api_version + ' · ' + plugin.manifest.kind : plugin.directory}
                      </span>
                    </div>
                    <div className="plugin-row__permissions">
                      {(plugin.manifest?.permissions || []).map((permission) => (
                        <Badge tone="outline" key={permission}>{permission}</Badge>
                      ))}
                      <Badge tone={plugin.valid ? 'success' : 'warn'}>{plugin.valid ? '清单有效' : '无效'}</Badge>
                    </div>
                    {plugin.warnings.length ? <p>{plugin.warnings.join(' · ')}</p> : null}
                    {plugin.error ? <p className="plugin-row__error">{plugin.error}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="settings-hint">
                还没有插件。将包含 <code>manifest.json</code> 的目录放入插件目录即可被识别；P3 仅做版本/权限校验，尚不执行第三方代码。
              </p>
            )}
            <p className="settings-hint">
              插件 API 目前为 1.0.0；支持的扩展点：崩溃分析、下载源、账号 Provider。权限必须在清单中显式声明。
            </p>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__heading">
            <div className="settings-section__icon">
              <ShieldCheck size={18} />
            </div>
            <div>
              <h2>关于方界</h2>
              <p>版本信息与数据来源</p>
            </div>
          </div>
          <div className="settings-card about-card">
            <div className="about-row">
              <div>
                <strong>方界启动器</strong>
                <span>v{boot.appVersion} · 非官方 Minecraft 启动器</span>
              </div>
              <Badge tone="accent">本地优先</Badge>
            </div>
            <p>
              游戏版本与资源来自 Mojang 官方元数据；模组搜索与下载来自 Modrinth 公共 API。
              方界不托管游戏文件，也不收集账号密码。
            </p>
            <div className="about-links">
              <a href="https://modrinth.com" target="_blank" rel="noreferrer">
                Modrinth <ChevronRight size={13} />
              </a>
              <span className="about-dot" />
              <a href="https://www.minecraft.net" target="_blank" rel="noreferrer">
                Minecraft <ChevronRight size={13} />
              </a>
            </div>
          </div>
        </section>
      </div>

      <div className="settings-footer">
        <span>{dirty ? '你有一些尚未保存的更改。' : '所有设置已保存。'}</span>
        <div>
          <Button
            variant="ghost"
            disabled={!dirty || saving}
            onClick={() => {
              setMemoryMb(boot.settings.memoryMb)
              setJavaPath(boot.settings.javaPath)
              setShowSnapshots(boot.settings.showSnapshots)
              setMinimizeOnLaunch(boot.settings.minimizeOnLaunch)
            }}
          >
            还原
          </Button>
          <Button
            variant="primary"
            icon={<Check size={16} />}
            loading={saving}
            disabled={!dirty}
            onClick={() => void save()}
          >
            保存设置
          </Button>
        </div>
      </div>
    </div>
  )
}
