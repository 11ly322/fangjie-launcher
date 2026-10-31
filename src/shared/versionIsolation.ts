import type { LoaderType, VersionIsolationMode } from './types'

export interface VersionIsolationTarget {
  loader: LoaderType
  mcVersion: string
}

export const VERSION_ISOLATION_OPTIONS: Array<{
  value: VersionIsolationMode
  label: string
  description: string
}> = [
  { value: 'off', label: '关闭', description: '所有实例共享存档、模组与配置。' },
  { value: 'modded', label: '隔离可安装 Mod 的版本', description: 'Fabric、Quilt、Forge、NeoForge 实例独立。' },
  { value: 'snapshot', label: '隔离非正式版', description: '快照版本的实例独立。' },
  {
    value: 'modded-snapshot',
    label: '隔离可安装 Mod 的版本与非正式版',
    description: '模组加载器实例和快照版本实例独立。'
  },
  { value: 'all', label: '隔离所有版本', description: '每个实例都使用独立的游戏目录。' }
]

export function isSnapshotVersion(mcVersion: string): boolean {
  return /(?:snapshot|^\d{2}w\d{2}[a-z]$)/i.test(mcVersion.trim())
}

export function shouldIsolateVersion(
  mode: VersionIsolationMode,
  target: VersionIsolationTarget
): boolean {
  if (mode === 'off') return false
  if (mode === 'all') return true
  const modded = target.loader !== 'vanilla'
  const snapshot = isSnapshotVersion(target.mcVersion)
  if (mode === 'modded') return modded
  if (mode === 'snapshot') return snapshot
  return modded || snapshot
}
