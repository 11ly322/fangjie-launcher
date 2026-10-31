export type PageName =
  | 'home'
  | 'instances'
  | 'instance'
  | 'mods'
  | 'multiplayer'
  | 'downloads'
  | 'settings'

export const PAGE_LABELS: Record<PageName, string> = {
  home: '启动',
  instances: '版本库',
  instance: '版本设置',
  mods: '资源下载',
  multiplayer: '联机',
  downloads: '下载中心',
  settings: '设置'
}

export const MODDED_LOADER_IDS = ['fabric', 'quilt', 'forge', 'neoforge'] as const
