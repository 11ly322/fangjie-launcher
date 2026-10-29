export type PageName = 'home' | 'instances' | 'instance' | 'mods' | 'downloads' | 'settings'

export const PAGE_LABELS: Record<PageName, string> = {
  home: '首页',
  instances: '游戏实例',
  instance: '实例详情',
  mods: '模组工坊',
  downloads: '下载中心',
  settings: '设置'
}

export const MODDED_LOADER_IDS = ['fabric', 'quilt', 'forge', 'neoforge'] as const
