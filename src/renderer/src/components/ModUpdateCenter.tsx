import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Download,
  Pin,
  PinOff,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  SkipForward
} from 'lucide-react'
import type {
  ModBackupEntry,
  ModUpdateEntry,
  ModUpdatePreference,
  ModUpdateReport
} from '../../../shared/types'
import { useLauncher } from '../state/LauncherContext'
import { Badge, Button, InlineNotice, Modal, Spinner } from './ui'
import { classNames } from '../lib/format'

interface ModUpdateCenterProps {
  instanceId: string
  instanceLabel?: string
  onChanged?: () => void
}

const STATUS_ORDER = ['update', 'current', 'unavailable'] as const

const STATUS_META = {
  update: { title: '可更新', tone: 'accent' as const, description: '有兼容的新版本可用' },
  current: { title: '已是最新', tone: 'success' as const, description: '当前版本已是最新兼容版本' },
  unavailable: { title: '不可自动更新', tone: 'warn' as const, description: '无法安全判断或获取新版本' }
}

function versionLabel(entry: ModUpdateEntry): string {
  return entry.latestVersionName || entry.latestVersionNumber || entry.latestVersionId || '新版本'
}

function sourceLabel(source: ModUpdateEntry['source']): string {
  if (source === 'curseforge') return 'CurseForge'
  if (source === 'modrinth') return 'Modrinth'
  return '本地 / 未知'
}

function formatTime(value: number): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

export function ModUpdateCenter({
  instanceId,
  instanceLabel,
  onChanged
}: ModUpdateCenterProps): React.JSX.Element {
  const { confirm, toast } = useLauncher()
  const [open, setOpen] = useState(false)
  const [report, setReport] = useState<ModUpdateReport | null>(null)
  const [backups, setBackups] = useState<ModBackupEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [busyProjectId, setBusyProjectId] = useState('')
  const [busyAll, setBusyAll] = useState(false)
  const [rollbackId, setRollbackId] = useState('')
  const requestId = useRef(0)
  const inFlight = useRef(false)

  useEffect(() => {
    setReport(null)
    setBackups([])
    setError('')
    setOpen(false)
    void loadReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId])

  useEffect(() => {
    if (!open || inFlight.current) return
    void loadReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, instanceId])

  async function loadReport(): Promise<void> {
    const current = ++requestId.current
    inFlight.current = true
    setLoading(true)
    setError('')
    try {
      const [check, backupsResult] = await Promise.all([
        window.fangjie.checkModUpdates(instanceId),
        window.fangjie.modUpdateBackups(instanceId)
      ])
      if (current !== requestId.current) return
      if (!check.ok) {
        setError(check.error)
        return
      }
      setReport(check.value)
      if (backupsResult.ok) setBackups(backupsResult.value)
    } catch (loadError) {
      if (current === requestId.current) {
        setError(loadError instanceof Error ? loadError.message : String(loadError))
      }
    } finally {
      if (current === requestId.current) {
        inFlight.current = false
        setLoading(false)
      }
    }
  }

  async function refreshInstalled(): Promise<void> {
    onChanged?.()
  }

  async function setPreference(entry: ModUpdateEntry, action: ModUpdatePreference): Promise<void> {
    const versionId =
      action === 'skip'
        ? entry.latestVersionId
        : action === 'pin'
          ? entry.currentVersionId
          : undefined
    if (action === 'skip' && !versionId) {
      toast('找不到可跳过的目标版本', 'error')
      return
    }
    setBusyProjectId(entry.projectId)
    const result = await window.fangjie.setModUpdatePreference(
      instanceId,
      entry.projectId,
      action,
      versionId
    )
    setBusyProjectId('')
    if (!result.ok) {
      toast(result.error, 'error')
      return
    }
    toast(
      action === 'pin'
        ? '已固定当前版本'
        : action === 'unpin'
          ? '已取消固定'
          : action === 'skip'
            ? '已跳过这个版本'
            : '已取消跳过',
      'success'
    )
    await refreshInstalled()
    await loadReport()
  }

  async function performUpdate(
    entry: ModUpdateEntry,
    refresh = true,
    skipConfirm = false
  ): Promise<boolean> {
    if (!skipConfirm) {
      const confirmed = await confirm({
        title: `更新 ${entry.title}？`,
        description: `将先备份 ${entry.fileName}，再下载并替换为 ${versionLabel(entry)}。如果更新失败会自动回滚。`,
        confirmLabel: '更新',
        cancelLabel: '取消'
      })
      if (!confirmed) return false
    }
    setBusyProjectId(entry.projectId)
    const result = await window.fangjie.updateMod(instanceId, entry.projectId)
    setBusyProjectId('')
    if (!result.ok) {
      toast(result.error, 'error')
      return false
    }
    if (result.value.updated) {
      toast(`${entry.title} 已更新到 ${versionLabel(entry)}`, 'success')
    } else if (result.value.rolledBack) {
      toast(`${entry.title} 更新失败，已自动回滚`, 'error')
      return false
    } else {
      toast(`${entry.title} 没有可更新版本`, 'info')
      return false
    }
    await refreshInstalled()
    if (refresh) {
      await loadReport()
    }
    return true
  }

  async function updateAll(): Promise<void> {
    const targets = (report?.entries || []).filter((entry) => entry.status === 'update')
    if (!targets.length) return
    const confirmed = await confirm({
      title: `更新 ${targets.length} 个模组？`,
      description:
        '更新会先备份旧 JAR，再逐个下载并替换。失败的模组会自动回滚；更新全部不会跳过任何可更新模组。',
      confirmLabel: '开始更新',
      cancelLabel: '取消'
    })
    if (!confirmed) return
    setBusyAll(true)
    let succeeded = 0
    try {
      for (const entry of targets) {
        if (await performUpdate(entry, false, true)) succeeded += 1
      }
      await loadReport()
      await refreshInstalled()
      toast(
        succeeded === targets.length
          ? `全部更新完成（${succeeded} 个）`
          : `更新完成 ${succeeded}/${targets.length} 个，其余已回滚或跳过`,
        succeeded === targets.length ? 'success' : 'info'
      )
    } finally {
      setBusyAll(false)
    }
  }

  async function rollback(backup: ModBackupEntry): Promise<void> {
    const confirmed = await confirm({
      title: '回滚这次模组更新？',
      description: `将删除更新后的 ${backup.title}，并恢复 ${backup.versionName}（${backup.fileName}）。这不会撤销其他模组的更新。`,
      confirmLabel: '回滚',
      cancelLabel: '取消',
      danger: true
    })
    if (!confirmed) return
    setRollbackId(backup.id)
    const result = await window.fangjie.rollbackModUpdate(instanceId, backup.id)
    setRollbackId('')
    if (!result.ok) {
      toast(result.error, 'error')
      return
    }
    toast(`已回滚 ${backup.title}`, 'success')
    await refreshInstalled()
    await loadReport()
  }

  const updates = report?.entries.filter((entry) => entry.status === 'update') || []
  const updateCount = report?.counts.update || 0
  const busy = busyAll || Boolean(busyProjectId) || Boolean(rollbackId)

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        icon={<RefreshCw size={14} />}
        loading={loading && open}
        onClick={() => {
          setOpen(true)
        }}
      >
        {updateCount ? `可更新（${updateCount}）` : '检查模组更新'}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="模组更新中心"
        description={
          instanceLabel
            ? `${instanceLabel} · 只显示与当前游戏版本和加载器兼容的版本`
            : '只显示与当前游戏版本和加载器兼容的版本'
        }
        size="lg"
        dismissible={!busyAll}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              关闭
            </Button>
            <Button
              variant="primary"
              icon={<Download size={15} />}
              loading={busyAll}
              disabled={!updates.length || Boolean(report?.offline) || busy}
              onClick={() => void updateAll()}
            >
              {updates.length ? `全部更新（${updates.length}）` : '暂无可更新'}
            </Button>
          </>
        }
      >
        {error ? (
          <InlineNotice
            tone="danger"
            title="检查更新失败"
            action={
              <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void loadReport()}>
                重试
              </Button>
            }
          >
            {error}
          </InlineNotice>
        ) : null}

        {report?.offline ? (
          <InlineNotice tone="warn" icon={<ShieldAlert size={18} />} title="离线模式已开启">
            更新检查没有发起任何网络请求。关闭离线模式后重新检查，才能获取兼容版本。
          </InlineNotice>
        ) : null}

        {loading && !report ? (
          <div className="mod-update-loading">
            <Spinner size={18} /> 正在检查已安装模组…
          </div>
        ) : null}

        {report ? (
          <>
            <div className="mod-update-summary">
              <span>
                <strong>{report.counts.total}</strong> 个模组
              </span>
              <span className="mod-update-summary__update">
                <strong>{report.counts.update}</strong> 可更新
              </span>
              <span>
                <strong>{report.counts.current}</strong> 已是最新
              </span>
              <span>
                <strong>{report.counts.unavailable}</strong> 不可自动更新
              </span>
              <span className="mod-update-summary__time">
                检查于 {formatTime(report.checkedAt)}
              </span>
            </div>

            {STATUS_ORDER.map((status) => {
              const entries = report.entries.filter((entry) => entry.status === status)
              if (!entries.length) return null
              const meta = STATUS_META[status]
              return (
                <section className="mod-update-section" key={status}>
                  <div className="mod-update-section__header">
                    <Badge tone={meta.tone}>{meta.title}</Badge>
                    <span>{meta.description}</span>
                    <span className="mod-update-section__count">{entries.length}</span>
                  </div>
                  <div className="mod-update-list">
                    {entries.map((entry) => {
                      const rowBusy = busyProjectId === entry.projectId
                      const canUpdate = entry.status === 'update' && !report.offline
                      return (
                        <article
                          className={classNames(
                            'mod-update-row',
                            entry.status === 'unavailable' && 'is-muted'
                          )}
                          key={entry.projectId}
                        >
                          <div className="mod-update-row__main">
                            <div className="mod-update-row__title-line">
                              <strong>{entry.title}</strong>
                              <Badge tone={entry.source === 'curseforge' ? 'violet' : 'outline'}>
                                {sourceLabel(entry.source)}
                              </Badge>
                              {entry.pinned ? <Badge tone="accent">已固定</Badge> : null}
                              {entry.skipped ? <Badge tone="warn">已跳过</Badge> : null}
                            </div>
                            <div className="mod-update-row__file">{entry.fileName}</div>
                            <div className="mod-update-row__versions">
                              <span>{entry.currentVersionName}</span>
                              {entry.latestVersionName && entry.status === 'update' ? (
                                <>
                                  <ArrowRight size={14} />
                                  <span className="mod-update-row__latest">
                                    {versionLabel(entry)}
                                  </span>
                                </>
                              ) : null}
                            </div>
                            {entry.reason ? (
                              <div className="mod-update-row__reason">{entry.reason}</div>
                            ) : null}
                            {entry.addedDependencies.length || entry.removedDependencies.length ? (
                              <div className="mod-update-deps">
                                {entry.addedDependencies.map((dependency) => (
                                  <span className="mod-update-dep mod-update-dep--added" key={`add-${dependency}`}>
                                    + 前置 {dependency}
                                  </span>
                                ))}
                                {entry.removedDependencies.map((dependency) => (
                                  <span className="mod-update-dep mod-update-dep--removed" key={`remove-${dependency}`}>
                                    - 前置 {dependency}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <div className="mod-update-row__actions">
                            {canUpdate ? (
                              <Button
                                size="sm"
                                variant="primary"
                                loading={rowBusy}
                                disabled={busyAll}
                                onClick={() => void performUpdate(entry)}
                              >
                                更新到 {versionLabel(entry)}
                              </Button>
                            ) : null}
                            {entry.status === 'update' && !report.offline ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<SkipForward size={14} />}
                                disabled={rowBusy || busyAll}
                                onClick={() => void setPreference(entry, 'skip')}
                              >
                                跳过此版本
                              </Button>
                            ) : null}
                            {entry.pinned ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<PinOff size={14} />}
                                disabled={rowBusy || busyAll}
                                onClick={() => void setPreference(entry, 'unpin')}
                              >
                                取消固定
                              </Button>
                            ) : entry.status !== 'unavailable' ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<Pin size={14} />}
                                disabled={rowBusy || busyAll}
                                onClick={() => void setPreference(entry, 'pin')}
                              >
                                固定版本
                              </Button>
                            ) : null}
                            {entry.skipped && !entry.pinned ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={rowBusy || busyAll}
                                onClick={() => void setPreference(entry, 'unskip')}
                              >
                                取消跳过
                              </Button>
                            ) : null}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </section>
              )
            })}

            {backups.length ? (
              <section className="mod-update-section mod-update-backups">
                <div className="mod-update-section__header">
                  <Badge tone="outline">备份与回滚</Badge>
                  <span>更新前的旧 JAR 会保留在这里，可手动恢复。</span>
                  <span className="mod-update-section__count">{backups.length}</span>
                </div>
                <div className="mod-update-list">
                  {backups.map((backup) => (
                    <article className="mod-update-row" key={backup.id}>
                      <div className="mod-update-row__main">
                        <div className="mod-update-row__title-line">
                          <strong>{backup.title}</strong>
                          <Badge tone={backup.status === 'committed' ? 'success' : 'neutral'}>
                            {backup.status === 'committed' ? '已备份' : '已回滚'}
                          </Badge>
                          <Badge tone="outline">{sourceLabel(backup.source)}</Badge>
                        </div>
                        <div className="mod-update-row__file">{backup.fileName}</div>
                        <div className="mod-update-row__versions">
                          <span>旧版本 {backup.versionName}</span>
                          {backup.updatedVersionId ? <span>· 更新后 {backup.updatedVersionId}</span> : null}
                        </div>
                        <div className="mod-update-row__reason">
                          备份于 {formatTime(backup.createdAt)}
                          {backup.rolledBackAt ? ` · 回滚于 ${formatTime(backup.rolledBackAt)}` : ''}
                        </div>
                      </div>
                      <div className="mod-update-row__actions">
                        {backup.status === 'committed' ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<RotateCcw size={14} />}
                            loading={rollbackId === backup.id}
                            disabled={busy}
                            onClick={() => void rollback(backup)}
                          >
                            回滚
                          </Button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {!report.entries.length ? (
              <InlineNotice tone="info" icon={<CheckCircle2 size={18} />} title="实例里还没有模组">
                先在模组工坊安装模组，再回来检查更新。
              </InlineNotice>
            ) : null}
          </>
        ) : null}
      </Modal>
    </>
  )
}
