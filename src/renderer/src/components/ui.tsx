import {
  AlertTriangle,
  Check,
  ChevronDown,
  Loader2,
  X
} from 'lucide-react'
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes
} from 'react'
import { createPortal } from 'react-dom'
import { classNames } from '../lib/format'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
  trailingIcon?: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  trailingIcon,
  className,
  children,
  disabled,
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <button
      className={classNames('button', `button--${variant}`, `button--${size}`, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 size={16} className="spin" aria-hidden="true" /> : icon}
      <span>{children}</span>
      {trailingIcon}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  size?: 'sm' | 'md'
  tone?: 'default' | 'danger'
}

export function IconButton({
  label,
  size = 'md',
  tone = 'default',
  className,
  children,
  ...props
}: IconButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={classNames('icon-button', `icon-button--${size}`, tone === 'danger' && 'is-danger', className)}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  )
}

export function Badge({
  children,
  tone = 'neutral',
  className
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'outline' | 'warn' | 'success' | 'violet'
  className?: string
}): React.JSX.Element {
  return <span className={classNames('badge', `badge--${tone}`, className)}>{children}</span>
}

export function ProgressBar({
  value,
  status = 'running',
  compact = false
}: {
  value: number
  status?: 'running' | 'success' | 'error' | 'cancelled'
  compact?: boolean
}): React.JSX.Element {
  const safe = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  return (
    <div
      className={classNames('progress', `progress--${status}`, compact && 'progress--compact')}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(safe)}
    >
      <span className="progress__fill" style={{ width: `${safe}%` }} />
    </div>
  )
}

export function Spinner({ size = 18, label = '加载中' }: { size?: number; label?: string }): React.JSX.Element {
  return (
    <span className="spinner" role="status" aria-label={label}>
      <Loader2 size={size} className="spin" />
    </span>
  )
}

export function Skeleton({
  className,
  style
}: {
  className?: string
  style?: React.CSSProperties
}): React.JSX.Element {
  return <span className={classNames('skeleton', className)} style={style} aria-hidden="true" />
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor
}: {
  label: string
  hint?: ReactNode
  error?: string
  children: ReactNode
  htmlFor?: string
}): React.JSX.Element {
  return (
    <div className="field">
      <div className="field__label-row">
        <label className="field__label" htmlFor={htmlFor}>
          {label}
        </label>
        {hint ? <span className="field__hint">{hint}</span> : null}
      </div>
      {children}
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return <input className={classNames('input', className)} {...props} />
}

export function TextArea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element {
  return <textarea className={classNames('input', 'textarea', className)} {...props} />
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return (
    <span className="select-wrap">
      <select className={classNames('select', className)} {...props}>
        {children}
      </select>
      <ChevronDown size={15} className="select-wrap__icon" aria-hidden="true" />
    </span>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={classNames('toggle', checked && 'is-on')}
      onClick={() => onChange(!checked)}
      disabled={disabled}
    >
      <span className="toggle__thumb" />
    </button>
  )
}

export function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled
}: {
  title: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <div className={classNames('toggle-row', disabled && 'is-disabled')}>
      <div>
        <div className="toggle-row__title">{title}</div>
        {description ? <div className="toggle-row__desc">{description}</div> : null}
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} disabled={disabled} />
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
  compact?: boolean
}): React.JSX.Element {
  return (
    <div className={classNames('empty-state', compact && 'empty-state--compact')}>
      <div className="empty-state__icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  )
}

export function InlineNotice({
  tone = 'info',
  icon,
  title,
  children,
  action
}: {
  tone?: 'info' | 'warn' | 'danger' | 'success'
  icon?: ReactNode
  title?: string
  children: ReactNode
  action?: ReactNode
}): React.JSX.Element {
  return (
    <div className={classNames('notice', `notice--${tone}`)}>
      <span className="notice__icon">{icon || <AlertTriangle size={17} />}</span>
      <div className="notice__body">
        {title ? <strong>{title}</strong> : null}
        <div>{children}</div>
      </div>
      {action}
    </div>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}): React.JSX.Element {
  return (
    <div className="section-heading">
      <div>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  dismissible?: boolean
  className?: string
}

const ModalStackContext = createContext(0)

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
  className
}: ModalProps): React.JSX.Element | null {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const stack = useContext(ModalStackContext)
  const zIndex = 70 + stack

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.body.style.overflow = 'hidden'
    const timer = window.setTimeout(() => {
      const body = panelRef.current?.querySelector<HTMLElement>('.modal__body')
      const explicit = body?.querySelector<HTMLElement>('[data-autofocus]')
      const target =
        explicit ||
        body?.querySelector<HTMLElement>(
          'input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [role="button"]:not([aria-disabled="true"]), [role="tab"]:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ||
        panelRef.current
      target?.focus({ preventScroll: true })
    }, 30)
    return () => {
      window.clearTimeout(timer)
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault()
        onClose()
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, dismissible, onClose])

  if (!open) return null
  return createPortal(
    <ModalStackContext.Provider value={stack + 1}>
      <div
        className="modal-overlay"
        style={{ zIndex }}
        onMouseDown={(event) => {
          if (dismissible && event.target === event.currentTarget) onClose()
        }}
      >
        <div
          ref={panelRef}
          className={classNames('modal', `modal--${size}`, className)}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
        >
          <header className="modal__header">
            <div>
              <h2 id={titleId}>{title}</h2>
              {description ? <p>{description}</p> : null}
            </div>
            {dismissible ? (
              <IconButton label="关闭" size="sm" onClick={onClose}>
                <X size={18} />
              </IconButton>
            ) : null}
          </header>
          <div className="modal__body">{children}</div>
          {footer ? <footer className="modal__footer">{footer}</footer> : null}
        </div>
      </div>
    </ModalStackContext.Provider>,
    document.body
  )
}

export function StatusDot({
  tone = 'neutral',
  pulse = false
}: {
  tone?: 'neutral' | 'success' | 'warn' | 'danger' | 'accent'
  pulse?: boolean
}): React.JSX.Element {
  return <span className={classNames('status-dot', `status-dot--${tone}`, pulse && 'status-dot--pulse')} />
}

export function CheckLine({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="check-line">
      <span className="check-line__icon">
        <Check size={12} strokeWidth={3} />
      </span>
      <span>{children}</span>
    </div>
  )
}
