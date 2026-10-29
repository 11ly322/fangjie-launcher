import { useEffect, useState, type CSSProperties } from 'react'
import {
  Check,
  ChevronRight,
  Cpu,
  FolderOpen,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  UserRound
} from 'lucide-react'
import { useLauncher } from '../state/LauncherContext'
import { PixelAvatar, SkinHead } from '../components/Artwork'
import {
  Badge,
  Button,
  Field,
  InlineNotice,
  StatusDot,
  ToggleRow
} from '../components/ui'
import { classNames, rangeProgress } from '../lib/format'

export function SettingsPage(): React.JSX.Element {
  const { boot, openAccount, refreshJava, saveSettings, toast } = useLauncher()
  const [memoryMb, setMemoryMb] = useState(boot.settings.memoryMb)
  const [javaPath, setJavaPath] = useState(boot.settings.javaPath)
  const [showSnapshots, setShowSnapshots] = useState(boot.settings.showSnapshots)
  const [minimizeOnLaunch, setMinimizeOnLaunch] = useState(boot.settings.minimizeOnLaunch)
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setMemoryMb(boot.settings.memoryMb)
    setJavaPath(boot.settings.javaPath)
    setShowSnapshots(boot.settings.showSnapshots)
    setMinimizeOnLaunch(boot.settings.minimizeOnLaunch)
  }, [boot.settings])

  const dirty =
    memoryMb !== boot.settings.memoryMb ||
    javaPath !== boot.settings.javaPath ||
    showSnapshots !== boot.settings.showSnapshots ||
    minimizeOnLaunch !== boot.settings.minimizeOnLaunch

  const save = async (): Promise<void> => {
    setSaving(true)
    setError('')
    const ok = await saveSettings({
      memoryMb,
      javaPath,
      showSnapshots,
      minimizeOnLaunch
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

  const currentJava = boot.java.runtimes.find((runtime) => runtime.path === javaPath)
  const automaticJava = boot.java.runtimes.find((runtime) => runtime.source === 'auto')
  const effectiveJava = javaPath ? currentJava : automaticJava

  return (
    <div className="page page--settings">
      <header className="page-header">
        <div>
          <div className="eyebrow">PREFERENCES</div>
          <h1>设置</h1>
          <p>调整账户、Java 与启动行为。更改会在点击保存后写入本地配置。</p>
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
              <Button variant="secondary" size="sm" icon={<FolderOpen size={14} />} onClick={() => void openData()}>
                打开
              </Button>
            </div>
            <div className="path-box">
              <div>
                <span>配置文件</span>
                <strong title={boot.configPath}>{boot.configPath}</strong>
              </div>
            </div>
            <p className="settings-hint">
              每个实例的存档与模组位于 <code>instances/&lt;实例ID&gt;/.minecraft</code>，游戏版本与运行库在实例之间共享。
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
