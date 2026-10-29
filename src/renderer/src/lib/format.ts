export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  if (value >= 100_000_000) return `${trimZero(value / 100_000_000)}亿`
  if (value >= 10_000) return `${trimZero(value / 10_000)}万`
  if (value >= 1000) return `${trimZero(value / 1000)}k`
  return String(Math.round(value))
}

function trimZero(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '')
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  if (value < 1024) return `${Math.round(value)} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function formatSpeed(value?: number): string {
  if (!value || value <= 0) return ''
  return `${formatBytes(value)}/s`
}

export function formatPlaytime(ms: number): string {
  if (!ms || ms < 0) return '尚未游玩'
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`
}

export function formatRelative(dateInput?: number | string | null): string {
  if (!dateInput) return '从未启动'
  const value = typeof dateInput === 'string' ? Date.parse(dateInput) : dateInput
  if (!Number.isFinite(value)) return '未知'
  const diff = Date.now() - value
  if (diff < 0) return '刚刚'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  if (days < 30) return `${Math.floor(days / 7)} 周前`
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(value)
}

export function formatDate(dateInput?: string | number | null): string {
  if (!dateInput) return '未知'
  const value = typeof dateInput === 'string' ? Date.parse(dateInput) : dateInput
  if (!Number.isFinite(value)) return '未知'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(value)
}

export function formatVersionType(type: string): string {
  if (type === 'release') return '正式版'
  if (type === 'snapshot') return '快照'
  if (type === 'old_beta') return '远古 Beta'
  if (type === 'old_alpha') return '远古 Alpha'
  return type
}

export function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

export function todayLabel(): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  }).format(new Date())
}

export function stripMarkdown(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<img[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~`>|]/g, '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function rangeProgress(value: number, min: number, max: number): string {
  if (max <= min) return '0%'
  return `${((clamp(value, min, max) - min) / (max - min)) * 100}%`
}

export function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}
