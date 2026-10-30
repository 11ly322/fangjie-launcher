import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  RotateCcw,
  ShieldCheck,
  Stethoscope,
  Wand2
} from 'lucide-react'
import type {
  CoreDiagnosisBundle,
  CoreRepairPlan,
  CoreRepairReceipt,
  InstanceSummary
} from '../../../shared/types'
import { Badge, Button, InlineNotice, Modal, Spinner } from './ui'
import { classNames } from '../lib/format'

const SEVERITY_LABEL: Record<string, string> = {
  critical: '严重',
  error: '错误',
  warning: '警告',
  info: '提示'
}

export function CrashDiagnosticsModal({
  open,
  instance,
  onClose,
  onChanged
}: {
  open: boolean
  instance: InstanceSummary
  onClose: () => void
  onChanged: () => void
}): React.JSX.Element {
  const [bundle, setBundle] = useState<CoreDiagnosisBundle | null>(null)
  const [plan, setPlan] = useState<CoreRepairPlan | null>(null)
  const [receipt, setReceipt] = useState<CoreRepairReceipt | null>(null)
  const [loading, setLoading] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [rollingBack, setRollingBack] = useState(false)
  const [error, setError] = useState('')

  const load = async (): Promise<void> => {
    setLoading(true)
    setError('')
    setBundle(null)
    setPlan(null)
    setReceipt(null)
    const result = await window.fangjie.diagnoseCrash(instance.id)
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setBundle(result.value)
  }

  useEffect(() => {
    if (open) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, instance.id])

  const preview = async (): Promise<void> => {
    setPreviewing(true)
    setError('')
    const result = await window.fangjie.previewCrashRepair(instance.id)
    setPreviewing(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setPlan(result.value)
  }

  const apply = async (): Promise<void> => {
    if (!plan) return
    setApplying(true)
    setError('')
    const result = await window.fangjie.applyCrashRepair(plan.id)
    setApplying(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setReceipt(result.value)
    setPlan(null)
    onChanged()
  }

  const rollback = async (): Promise<void> => {
    if (!receipt) return
    setRollingBack(true)
    setError('')
    const result = await window.fangjie.rollbackCrashRepair(receipt.repair_id)
    setRollingBack(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setReceipt(null)
    onChanged()
    await load()
  }

  const busy = loading || previewing || applying || rollingBack
  const diagnoses = bundle?.diagnosis.diagnoses || []
  const footer = receipt ? (
    <>
      <span className="crash-footer-note">
        <ShieldCheck size={14} /> 修复已写入备份，可随时回滚
      </span>
      <Button variant="secondary" onClick={onClose}>
        关闭
      </Button>
      <Button
        variant="danger"
        icon={<RotateCcw size={15} />}
        loading={rollingBack}
        onClick={() => void rollback()}
      >
        回滚本次修复
      </Button>
    </>
  ) : plan ? (
    <>
      <span className="crash-footer-note">
        <AlertTriangle size={14} /> 确认后才会写入文件
      </span>
      <Button variant="ghost" onClick={() => setPlan(null)} disabled={applying}>
        返回诊断
      </Button>
      <Button
        variant="primary"
        icon={<Wand2 size={15} />}
        loading={applying}
        disabled={!plan.diff.length}
        onClick={() => void apply()}
      >
        确认执行修复
      </Button>
    </>
  ) : (
    <>
      <span className="crash-footer-note">只读分析，不会自动修改实例</span>
      <Button variant="ghost" onClick={onClose}>
        关闭
      </Button>
      <Button
        variant="primary"
        icon={<FileSearch size={15} />}
        loading={previewing}
        disabled={loading || Boolean(error)}
        onClick={() => void preview()}
      >
        生成修复预览
      </Button>
    </>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={receipt ? '修复完成' : plan ? '修复预览' : '崩溃诊断'}
      description={
        receipt
          ? '文件已经修改并建立备份。确认游戏恢复正常后，备份可以保留，也可以回滚。'
          : plan
            ? '逐项检查将要发生的文件变化；只有点击确认执行才会落盘。'
            : `读取 ${instance.name} 的最新日志、崩溃报告与 JAR 元数据。`
      }
      size="lg"
      dismissible={!busy}
      footer={footer}
    >
      {error ? (
        <InlineNotice
          tone="danger"
          title="诊断暂时不可用"
          action={
            <Button size="sm" variant="secondary" onClick={() => void (plan ? preview() : load())}>
              重试
            </Button>
          }
        >
          {error}
        </InlineNotice>
      ) : null}

      {loading ? (
        <div className="crash-loading">
          <Spinner size={22} />
          <div>
            <strong>正在读取日志与 JAR 元数据</strong>
            <span>日志文件较大时可能需要几秒钟。</span>
          </div>
        </div>
      ) : null}

      {!loading && bundle && !plan && !receipt ? (
        <div className="crash-report">
          <div className="crash-report__summary">
            <span><FileSearch size={14} /> {bundle.log_lines} 行日志</span>
            <span><Stethoscope size={14} /> {diagnoses.length} 个命中模式</span>
            <span><ShieldCheck size={14} /> {bundle.scan.mods.length} 个 JAR</span>
            <Badge tone={bundle.crash_report_found ? 'warn' : 'outline'}>
              {bundle.crash_report_found ? '已读取 crash-report' : '仅 latest.log'}
            </Badge>
          </div>

          {diagnoses.length ? (
            <div className="crash-diagnoses">
              {diagnoses.map((diagnosis) => (
                <article className="crash-diagnosis" key={diagnosis.code}>
                  <div className="crash-diagnosis__head">
                    <span
                      className={classNames(
                        'crash-severity',
                        `crash-severity--${diagnosis.severity}`
                      )}
                    >
                      {SEVERITY_LABEL[diagnosis.severity] || diagnosis.severity}
                    </span>
                    <strong>{diagnosis.title}</strong>
                    <span className="crash-confidence">置信度 {diagnosis.confidence}%</span>
                  </div>
                  <p>{diagnosis.root_cause}</p>
                  {diagnosis.evidence.length ? (
                    <div className="crash-evidence">
                      {diagnosis.evidence.slice(0, 3).map((evidence, index) => (
                        <code key={`${diagnosis.code}-${index}`} title={evidence.excerpt}>
                          {evidence.source}
                          {evidence.line ? `:${evidence.line}` : ''} · {evidence.excerpt}
                        </code>
                      ))}
                    </div>
                  ) : null}
                  <div className="crash-actions">
                    {diagnosis.suggested_actions.map((action) => (
                      <span key={action.kind} className="crash-suggestion">
                        {action.label}
                        {action.automatic ? <Badge tone="accent">可自动</Badge> : <Badge tone="outline">需手动</Badge>}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <InlineNotice tone="info" title="没有命中已知崩溃模式">
              这不代表实例没有问题，只说明当前规则表没有匹配到明确症状。可以先检查启动日志末尾，或把日志反馈给开发者补充模式。
            </InlineNotice>
          )}

          {bundle.scan.missing_dependencies.length ? (
            <div className="crash-scan-block">
              <h4>缺失前置</h4>
              {bundle.scan.missing_dependencies.slice(0, 8).map((dep) => (
                <div className="crash-scan-row" key={`${dep.mod_file}-${dep.dependency_id}`}>
                  <span>{dep.mod_file}</span>
                  <strong>{dep.dependency_id}</strong>
                  <Badge tone={dep.mandatory ? 'warn' : 'outline'}>
                    {dep.mandatory ? '必需' : '可选'}
                  </Badge>
                </div>
              ))}
            </div>
          ) : null}

          {bundle.scan.conflicts.length ? (
            <div className="crash-scan-block">
              <h4>冲突与重复</h4>
              {bundle.scan.conflicts.map((conflict) => (
                <div className="crash-scan-row" key={conflict.code}>
                  <span>{conflict.title}</span>
                  <strong>{conflict.mods.join(' / ')}</strong>
                  <Badge tone={conflict.severity === 'error' ? 'warn' : 'outline'}>
                    {conflict.suggestion}
                  </Badge>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {plan ? (
        <div className="repair-preview">
          <div className="repair-preview__head">
            <div>
              <span className="eyebrow">DRY RUN · NO FILES WRITTEN</span>
              <h3>将要修改 {plan.diff.length} 个路径</h3>
            </div>
            <Badge tone="warn">{plan.actions.length} 个动作</Badge>
          </div>
          {plan.diff.length ? (
            <div className="diff-list">
              {plan.diff.map((entry, index) => (
                <div className="diff-row" key={`${entry.path}-${index}`}>
                  <span className={classNames('diff-kind', `diff-kind--${entry.kind}`)}>
                    {entry.kind === 'create'
                      ? '新增'
                      : entry.kind === 'rename'
                        ? '重命名'
                        : entry.kind === 'delete'
                          ? '删除'
                          : '修改'}
                  </span>
                  <div className="diff-row__body">
                    <code>{entry.path}</code>
                    <p>{entry.summary}</p>
                    {entry.before || entry.after ? (
                      <div className="diff-values">
                        {entry.before ? <span className="diff-before">− {entry.before}</span> : null}
                        {entry.after ? <span className="diff-after">+ {entry.after}</span> : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <InlineNotice tone="info" title="没有可执行的自动修复">
              当前诊断可能只包含需要手动处理的建议，或前置解析失败。可以查看诊断页面的警告。
            </InlineNotice>
          )}
          {plan.warnings.length ? (
            <div className="repair-warnings">
              {plan.warnings.map((warning) => (
                <span key={warning}><AlertTriangle size={13} /> {warning}</span>
              ))}
            </div>
          ) : null}
          <div className="repair-safety">
            <ShieldCheck size={17} />
            <div>
              <strong>执行前会逐文件备份</strong>
              <span>备份位置写入实例的 .fangjie/backups；修复后可一键回滚。</span>
            </div>
          </div>
        </div>
      ) : null}

      {receipt ? (
        <div className="repair-receipt">
          <div className="repair-receipt__icon">
            <CheckCircle2 size={30} />
          </div>
          <h3>修复已应用</h3>
          <p>
            共修改 {receipt.changes.length} 个文件。备份已建立，若启动仍然失败可以回滚。
          </p>
          <code className="receipt-path" title={receipt.backup_dir}>{receipt.backup_dir}</code>
          <div className="repair-receipt__meta">
            <span>修复 ID</span>
            <code>{receipt.repair_id}</code>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
