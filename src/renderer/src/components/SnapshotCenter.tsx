import { useEffect, useState } from 'react'
import { Archive, ArrowLeft, Camera, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import type { Instance, SnapshotKind, SnapshotMeta, SnapshotPreview } from '../../../shared/types'
import { useLauncher } from '../state/LauncherContext'
import { Badge, Button, InlineNotice, Modal, Spinner, TextInput } from '../components/ui'
import { formatBytes, formatDate } from '../lib/format'

const KIND_LABEL: Record<SnapshotKind, string> = {
  manual: '手动',
  auto: '自动',
  safety: '恢复前备份'
}

const KIND_TONE: Record<SnapshotKind, 'accent' | 'neutral' | 'warn'> = {
  manual: 'accent',
  auto: 'neutral',
  safety: 'warn'
}

const ACTION_LABEL: Record<'create' | 'overwrite' | 'unchanged', string> = {
  create: '新建',
  overwrite: '覆盖',
  unchanged: '相同大小'
}

export function SnapshotCenter({ instance }: { instance: Instance }): React.JSX.Element {
  const { confirm, toast, running } = useLauncher()
  const [open, setOpen] = useState(false)
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [creating, setCreating] = useState(false)
  const [preview, setPreview] = useState<SnapshotPreview | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const isRunning = running.has(instance.id)

  const load = async (): Promise<void> => {
    setLoading(true)
    setError('')
    const result = await window.fangjie.snapshotsList(instance.id)
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSnapshots(result.value)
  }

  useEffect(() => {
    if (!open) return
    setPreview(null)
    void load()
  }, [open, instance.id])

  const create = async (): Promise<void> => {
    if (isRunning) {
      toast('游戏正在运行，无法创建快照', 'error')
      return
    }
    setCreating(true)
    const result = await window.fangjie.snapshotsCreate(instance.id, note.trim())
    setCreating(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNote('')
    toast('快照已创建', 'success')
    await load()
  }

  const openPreview = async (snapshot: SnapshotMeta): Promise<void> => {
    setError('')
    setLoading(true)
    const result = await window.fangjie.snapshotsPreview(instance.id, snapshot.id)
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setPreview(result.value)
  }

  const restore = async (): Promise<void> => {
    if (!preview) return
    const approved = await confirm({
      title: '恢复这个快照？',
      description: `会用「${formatDate(preview.snapshot.createdAt)}」的世界和配置覆盖当前文件。恢复前会自动创建一份安全快照，当前状态仍可找回。`,
      confirmLabel: '恢复快照',
      danger: true
    })
    if (!approved) return
    setRestoring(true)
    setError('')
    const result = await window.fangjie.snapshotsRestore(instance.id, preview.snapshot.id)
    setRestoring(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast(`已恢复 ${result.value.restoredFiles} 个文件，安全快照 ${result.value.safetySnapshotId}`, 'success')
    setPreview(null)
    await load()
  }

  const remove = async (snapshot: SnapshotMeta): Promise<void> => {
    const approved = await confirm({
      title: '删除这个快照？',
      description: `「${formatDate(snapshot.createdAt)}」的快照会从磁盘删除。该操作无法撤销。`,
      confirmLabel: '删除快照',
      danger: true
    })
    if (!approved) return
    setDeletingId(snapshot.id)
    setError('')
    const result = await window.fangjie.snapshotsDelete(instance.id, snapshot.id)
    setDeletingId('')
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast('快照已删除', 'success')
    if (preview?.snapshot.id === snapshot.id) setPreview(null)
    await load()
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        icon={<Archive size={15} />}
        onClick={() => setOpen(true)}
      >
        世界快照
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="世界快照"
        description={`${instance.name} · 存档、options.txt、config 与模组清单`}
        size="lg"
        footer={
          preview ? (
            <>
              <Button variant="ghost" onClick={() => setPreview(null)}>
                返回列表
              </Button>
              <Button
                variant="primary"
                icon={<RotateCcw size={15} />}
                loading={restoring}
                disabled={!preview.canRestore}
                onClick={() => void restore()}
              >
                恢复这个快照
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                关闭
              </Button>
              <Button
                variant="secondary"
                icon={<Camera size={15} />}
                loading={creating}
                disabled={isRunning}
                onClick={() => void create()}
              >
                创建快照
              </Button>
            </>
          )
        }
      >
        {preview ? (
          <div className="snapshot-preview">
            <div className="snapshot-preview__summary">
              <div>
                <strong>{formatDate(preview.snapshot.createdAt)}</strong>
                <span>{preview.snapshot.note || '未填写备注'}</span>
              </div>
              <div className="snapshot-preview__counts">
                <Badge tone="accent">{preview.createCount} 新建</Badge>
                <Badge tone="warn">{preview.overwriteCount} 覆盖</Badge>
                <Badge tone="neutral">{formatBytes(preview.snapshot.totalBytes)}</Badge>
              </div>
            </div>
            {preview.gameRunning ? (
              <InlineNotice tone="warn">{preview.blockedReason}</InlineNotice>
            ) : null}
            <p className="snapshot-hint">
              恢复只覆盖快照内的存档和配置，不会删除快照之外新增的文件。恢复前会自动保存当前状态。
            </p>
            <div className="snapshot-diff">
              <div className="snapshot-diff__head">
                <span>路径</span>
                <span>动作</span>
                <span>大小</span>
              </div>
              {preview.items.length ? (
                preview.items.map((item) => (
                  <div className="snapshot-diff__row" key={`${item.kind}-${item.path}`}>
                    <code>{item.path}</code>
                    <Badge tone={item.action === 'create' ? 'accent' : 'warn'}>
                      {ACTION_LABEL[item.action]}
                    </Badge>
                    <span>{formatBytes(item.incomingBytes)}</span>
                  </div>
                ))
              ) : (
                <div className="snapshot-empty">快照里没有可恢复的存档或配置。</div>
              )}
            </div>
          </div>
        ) : (
          <div className="snapshot-center">
            <div className="snapshot-create">
              <div>
                <strong>创建一份当前状态快照</strong>
                <span>快照放在实例的 .fangjie/snapshots 目录，使用流式 ZIP 写入。</span>
              </div>
              <div className="snapshot-create__row">
                <TextInput
                  value={note}
                  maxLength={120}
                  placeholder="备注（可选）"
                  onChange={(event) => setNote(event.target.value)}
                />
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Camera size={15} />}
                  loading={creating}
                  disabled={isRunning}
                  onClick={() => void create()}
                >
                  立即创建
                </Button>
              </div>
              {isRunning ? <InlineNotice tone="warn">游戏正在运行，结束游戏后才能创建或恢复快照。</InlineNotice> : null}
            </div>

            {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
            <div className="snapshot-list-head">
              <span>已有快照</span>
              <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={() => void load()}>
                刷新
              </Button>
            </div>
            {loading ? (
              <div className="snapshot-loading">
                <Spinner size={18} /> 正在读取快照…
              </div>
            ) : snapshots.length ? (
              <div className="snapshot-list">
                {snapshots.map((snapshot) => (
                  <div className="snapshot-row" key={snapshot.id}>
                    <div className="snapshot-row__main">
                      <div className="snapshot-row__title">
                        <Badge tone={KIND_TONE[snapshot.kind]}>{KIND_LABEL[snapshot.kind]}</Badge>
                        <strong>{formatDate(snapshot.createdAt)}</strong>
                        <span>{snapshot.note || '未填写备注'}</span>
                      </div>
                      <div className="snapshot-row__meta">
                        <span>{formatBytes(snapshot.size)}</span>
                        <span>{snapshot.worlds.length} 个世界</span>
                        <span>{snapshot.configFiles} 个配置</span>
                        <span>{snapshot.modsCount} 个模组</span>
                        {!snapshot.available ? <span>文件缺失</span> : null}
                      </div>
                    </div>
                    <div className="snapshot-row__actions">
                      <Button variant="secondary" size="sm" onClick={() => void openPreview(snapshot)}>
                        预览
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<RotateCcw size={14} />}
                        disabled={isRunning || !snapshot.available}
                        onClick={() => void openPreview(snapshot)}
                      >
                        恢复
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 size={14} />}
                        loading={deletingId === snapshot.id}
                        onClick={() => void remove(snapshot)}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="snapshot-empty">
                <ArrowLeft size={20} className="rotate-180" />
                还没有快照。创建后会在这里看到存档和配置摘要。
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}
