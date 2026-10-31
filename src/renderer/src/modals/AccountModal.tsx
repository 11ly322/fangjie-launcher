import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  ImagePlus,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRound
} from 'lucide-react'
import type { Account } from '../../../shared/types'
import { MODDED_LOADERS } from '../../../shared/constants'
import { Modal, Button, Field, TextInput, InlineNotice, Badge, Select } from '../components/ui'
import { PixelAvatar, SkinHead } from '../components/Artwork'
import { useLauncher } from '../state/LauncherContext'
import { classNames } from '../lib/format'

type AccountTab = 'offline' | 'microsoft'

export function AccountModal({
  open,
  onClose,
  initialTab
}: {
  open: boolean
  onClose: () => void
  initialTab?: AccountTab
}): React.JSX.Element {
  const { boot, refresh, toast, confirm } = useLauncher()
  const [tab, setTab] = useState<AccountTab>('offline')
  const [name, setName] = useState(boot.account.name)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [microsoftLoading, setMicrosoftLoading] = useState(false)
  const [skinLoading, setSkinLoading] = useState(false)
  const [skinApplyLoading, setSkinApplyLoading] = useState(false)
  const [skinTarget, setSkinTarget] = useState('')
  const [skinError, setSkinError] = useState('')
  const [avatarFailed, setAvatarFailed] = useState(false)
  const [switching, setSwitching] = useState(false)

  const accounts = boot.accounts?.length ? boot.accounts : [boot.account]
  const microsoftAccounts = accounts.filter((entry) => entry.type === 'microsoft')
  const offlineAccounts = accounts.filter((entry) => entry.type === 'offline')
  const activeUuid = boot.activeAccountId || boot.account.uuid

  const moddedInstances = useMemo(
    () =>
      boot.instances.filter((instance) =>
        MODDED_LOADERS.includes(instance.loader as (typeof MODDED_LOADERS)[number])
      ),
    [boot.instances]
  )

  useEffect(() => {
    if (!open) return
    setTab(initialTab || (boot.account.type === 'microsoft' ? 'microsoft' : 'offline'))
    setName(boot.account.name)
    setError('')
    setSaving(false)
    setMicrosoftLoading(false)
    setSkinError('')
    setAvatarFailed(false)
    const nextTarget =
      moddedInstances.find((instance) => !boot.account.skin?.appliedInstanceIds.includes(instance.id)) ||
      moddedInstances[0]
    setSkinTarget(nextTarget?.id || '')
  }, [open, boot.account, moddedInstances, initialTab])

  const saveOffline = async (): Promise<void> => {
    const cleaned = name.trim()
    if (!/^[A-Za-z0-9_]{3,16}$/.test(cleaned)) {
      setError('玩家名需要 3–16 位，只能使用字母、数字和下划线')
      return
    }
    setSaving(true)
    setError('')
    const result = await window.fangjie.updateAccount(cleaned)
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    await refresh()
    toast('离线档案已保存', 'success')
  }

  const loginMicrosoft = async (): Promise<void> => {
    setMicrosoftLoading(true)
    setError('')
    const result = await window.fangjie.loginMicrosoft()
    setMicrosoftLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    await refresh()
    toast(`已登录正版账号 ${result.value.name}`, 'success')
    onClose()
  }

  const logout = async (): Promise<void> => {
    const approved = await confirm({
      title: '退出正版账号？',
      description: '只会退出当前正版账号并清除它的本地令牌；其他已保存的账号不会被删除。',
      confirmLabel: '退出登录',
      danger: true
    })
    if (!approved) return
    const result = await window.fangjie.logoutAccount()
    if (!result.ok) {
      toast(result.error, 'error')
      return
    }
    await refresh()
    setTab('offline')
    toast('已退出正版账号', 'info')
  }

  const switchAccount = async (uuid: string): Promise<void> => {
    if (uuid === activeUuid || switching) return
    setSwitching(true)
    setError('')
    const result = await window.fangjie.setActiveAccount(uuid)
    setSwitching(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    await refresh()
    setTab(result.value.type === 'microsoft' ? 'microsoft' : 'offline')
    setName(result.value.name)
    toast(`已切换到 ${result.value.name}`, 'success')
  }

  const chooseSkin = async (): Promise<void> => {
    setSkinLoading(true)
    setSkinError('')
    const result = await window.fangjie.chooseSkin('classic')
    setSkinLoading(false)
    if (!result.ok) {
      setSkinError(result.error)
      return
    }
    if (!result.value) return
    await refresh()
    toast('皮肤已保存到本地', 'success')
  }

  const applySkin = async (): Promise<void> => {
    if (!skinTarget) {
      setSkinError('请先创建一个带模组加载器的实例')
      return
    }
    setSkinApplyLoading(true)
    setSkinError('')
    const result = await window.fangjie.applySkin(skinTarget)
    setSkinApplyLoading(false)
    if (!result.ok) {
      setSkinError(result.error)
      return
    }
    await refresh()
    toast('本地皮肤已应用到实例，启动游戏即可看到', 'success')
  }

  const account = boot.account
  const isPremium = account.type === 'microsoft'
  const skinData = account.skin?.dataUrl
  const avatarUrl = isPremium
    ? `https://crafatar.com/avatars/${account.uuid}?overlay&size=96`
    : undefined

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="玩家档案"
      description={tab === 'microsoft' ? 'Microsoft 正版账户' : '离线档案与本地皮肤'}
      size="md"
      className="account-modal"
      footer={
        tab === 'offline' ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              关闭
            </Button>
            <Button
              variant="primary"
              onClick={() => void saveOffline()}
              loading={saving}
              icon={<Check size={16} />}
            >
              保存离线档案
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              关闭
            </Button>
            {isPremium ? (
              <Button variant="secondary" icon={<LogOut size={15} />} onClick={() => void logout()}>
                退出正版账号
              </Button>
            ) : null}
          </>
        )
      }
    >
      <div className="account-entry-switch" role="tablist" aria-label="选择进入方式">
        <button
          type="button"
          role="tab"
          className={classNames('account-entry', isPremium && 'is-selected')}
          aria-selected={isPremium}
          disabled={switching}
          onClick={() => {
            setTab('microsoft')
            if (!isPremium && microsoftAccounts[0]) void switchAccount(microsoftAccounts[0].uuid)
          }}
        >
          <ShieldCheck size={15} />
          正版
          <span>{microsoftAccounts.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          className={classNames('account-entry', !isPremium && 'is-selected')}
          aria-selected={!isPremium}
          disabled={switching}
          onClick={() => {
            setTab('offline')
            if (isPremium && offlineAccounts[0]) void switchAccount(offlineAccounts[0].uuid)
          }}
        >
          <UserRound size={15} />
          离线
          <span>{offlineAccounts.length}</span>
        </button>
      </div>

      {accounts.length > 1 ? (
        <div className="account-switcher" aria-label="已保存的账号">
          <div className="account-switcher__label">已保存的账号 · 点击热切换</div>
          <div className="account-switcher__list">
            {accounts.map((entry) => {
              const active = entry.uuid === activeUuid
              return (
                <button
                  key={entry.uuid}
                  type="button"
                  className={classNames('account-choice', active && 'is-active')}
                  aria-pressed={active}
                  disabled={active || switching}
                  onClick={() => void switchAccount(entry.uuid)}
                >
                  {entry.skin?.dataUrl ? (
                    <SkinHead dataUrl={entry.skin.dataUrl} size={26} />
                  ) : (
                    <PixelAvatar name={entry.name} size={26} />
                  )}
                  <span>
                    <strong>{entry.name}</strong>
                    <small>{entry.type === 'microsoft' ? '正版账号' : '离线档案'}</small>
                  </span>
                  {active ? <Check size={14} /> : null}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {tab === 'offline' ? (
        <>
          <div className="account-preview">
            {skinData ? (
              <SkinHead dataUrl={skinData} size={64} />
            ) : (
              <PixelAvatar name={name || 'Steve'} size={64} />
            )}
            <div>
              <strong>{name || 'Steve'}</strong>
              <span>
                <ShieldCheck size={13} /> 离线登录 · 无需密码
              </span>
            </div>
            {isPremium ? <Badge tone="warn">保存后切换为离线</Badge> : null}
          </div>

          <Field
            label="玩家名"
            hint={`${name.trim().length}/16`}
            error={error}
            htmlFor="account-name"
          >
            <TextInput
              id="account-name"
              value={name}
              maxLength={16}
              autoComplete="off"
              spellCheck={false}
              placeholder="输入玩家名"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void saveOffline()
              }}
            />
          </Field>

          {isPremium ? (
            <InlineNotice tone="warn" title="当前使用正版账户">
              保存离线档案会自动切换到这个离线身份；正版账号和登录令牌会保留，可随时切回。
            </InlineNotice>
          ) : (
            <InlineNotice tone="info" icon={<UserRound size={17} />} title="关于离线档案">
              离线档案只在本机使用，不连接 Mojang 账户系统。需要正版验证的服务器将无法进入。
            </InlineNotice>
          )}

          <div className="skin-panel">
            <div className="skin-panel__heading">
              <div>
                <div className="panel__eyebrow">LOCAL SKIN</div>
                <h3>本地离线皮肤</h3>
              </div>
              <Badge tone="outline">仅自己可见</Badge>
            </div>
            <div className="skin-panel__body">
              <div className="skin-preview">
                {skinData ? (
                  <SkinHead dataUrl={skinData} size={74} />
                ) : (
                  <div className="skin-preview__empty">
                    <ImagePlus size={22} />
                  </div>
                )}
                <div className="skin-preview__meta">
                  <strong>{account.skin ? `${account.name} 的本地皮肤` : '还没有本地皮肤'}</strong>
                  <span>64×64 PNG · 经典模型 · 需要通过 CustomSkinLoader 加载</span>
                </div>
              </div>
              <div className="skin-controls">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<ImagePlus size={14} />}
                  loading={skinLoading}
                  onClick={() => void chooseSkin()}
                >
                  {account.skin ? '更换皮肤' : '选择 PNG 皮肤'}
                </Button>
              </div>
            </div>
            <div className="skin-apply">
              <Select
                value={skinTarget}
                onChange={(event) => setSkinTarget(event.target.value)}
                aria-label="选择应用皮肤的实例"
              >
                {!moddedInstances.length ? <option value="">暂无模组实例</option> : null}
                {moddedInstances.map((instance) => {
                  const applied = account.skin?.appliedInstanceIds.includes(instance.id)
                  return (
                    <option key={instance.id} value={instance.id}>
                      {instance.name} · {instance.loader} {applied ? '（已应用）' : ''}
                    </option>
                  )
                })}
              </Select>
              <Button
                variant="primary"
                size="sm"
                icon={<Sparkles size={14} />}
                disabled={!skinData || !skinTarget}
                loading={skinApplyLoading}
                onClick={() => void applySkin()}
              >
                应用到实例
              </Button>
            </div>
            {skinError ? <div className="skin-error">{skinError}</div> : null}
            <p className="skin-hint">
              应用时会为实例安装 CustomSkinLoader，并写入本地皮肤配置。皮肤只在自己的客户端显示；
              其他玩家仍然看不到离线皮肤。正版账户请使用 Mojang 皮肤。
            </p>
          </div>
        </>
      ) : (
        <div className="microsoft-panel">
          {isPremium ? (
            <>
              <div className="microsoft-profile">
                {avatarUrl && !avatarFailed ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    onError={() => setAvatarFailed(true)}
                    className="microsoft-profile__avatar"
                  />
                ) : (
                  <PixelAvatar name={account.name} size={64} />
                )}
                <div>
                  <div className="microsoft-profile__name">
                    {account.name}
                    <Badge tone="success">正版</Badge>
                  </div>
                  <div className="microsoft-profile__uuid mono">{account.uuid}</div>
                  <div className="microsoft-profile__note">
                    启动游戏时将使用 Microsoft / Xbox Live 正版验证。
                  </div>
                </div>
              </div>
              <div className="microsoft-actions">
                <Button
                  variant="secondary"
                  icon={<RefreshCw size={15} />}
                  loading={microsoftLoading}
                  onClick={() => void loginMicrosoft()}
                >
                  重新登录
                </Button>
                <Button variant="ghost" icon={<LogOut size={15} />} onClick={() => void logout()}>
                  退出正版账号
                </Button>
              </div>
              {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
              <InlineNotice tone="success" title="在线模式已启用">
                进入需要正版验证的服务器时，启动器会使用此账号的 Minecraft 令牌。登录令牌在本机加密保存。
              </InlineNotice>
            </>
          ) : (
            <>
              <div className="microsoft-hero">
                <div className="microsoft-hero__icon">
                  <ShieldCheck size={27} />
                </div>
                <h3>使用 Microsoft 账号登录</h3>
                <p>
                  通过 Microsoft 官方登录页验证 Xbox Live 与 Minecraft: Java Edition。
                  启动器不会接触你的密码，只会保存加密后的登录令牌。
                </p>
                <Button
                  variant="primary"
                  size="lg"
                  icon={<ShieldCheck size={17} />}
                  loading={microsoftLoading}
                  onClick={() => void loginMicrosoft()}
                >
                  打开 Microsoft 登录
                </Button>
                {microsoftLoading ? (
                  <span className="microsoft-loading">
                    <RefreshCw size={14} className="spin" />
                    已打开登录窗口，请完成登录…
                  </span>
                ) : null}
              </div>
              {error ? <InlineNotice tone="danger" title="登录未完成">{error}</InlineNotice> : null}
              <InlineNotice tone="info" title="需要拥有 Minecraft: Java Edition">
                登录过程会检查该账号是否拥有 Java 版。Xbox 家庭组的未成年账号可能需要成年人授权。
              </InlineNotice>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
