export const INSTANCE_ICONS = [
  'pickaxe',
  'trees',
  'castle',
  'compass',
  'gem',
  'mountain',
  'home',
  'sword'
] as const

export type InstanceIcon = (typeof INSTANCE_ICONS)[number]

export const INSTANCE_ICON_LABELS: Record<string, string> = {
  pickaxe: '生存',
  trees: '自然',
  castle: '建筑',
  compass: '探索',
  gem: '冒险',
  mountain: '风景',
  home: '家园',
  sword: '战斗'
}

export const INSTANCE_ACCENTS = [
  '#b8e85c',
  '#f2b860',
  '#8ecae6',
  '#f08a8a',
  '#b8a1f5',
  '#6fd6b0'
] as const

export const MOD_CATEGORIES: Array<{ id: string; label: string }> = [
  { id: '', label: '全部' },
  { id: 'optimization', label: '优化' },
  { id: 'technology', label: '科技' },
  { id: 'magic', label: '魔法' },
  { id: 'adventure', label: '冒险' },
  { id: 'decoration', label: '装饰' },
  { id: 'worldgen', label: '世界生成' },
  { id: 'library', label: '前置库' },
  { id: 'storage', label: '存储' },
  { id: 'transportation', label: '交通' },
  { id: 'food', label: '食物' },
  { id: 'mobs', label: '生物' },
  { id: 'equipment', label: '装备' },
  { id: 'utility', label: '实用工具' },
  { id: 'management', label: '管理' },
  { id: 'game-mechanics', label: '游戏机制' }
]

export const LOADER_LABEL: Record<string, string> = {
  vanilla: '原版',
  fabric: 'Fabric',
  quilt: 'Quilt',
  forge: 'Forge',
  neoforge: 'NeoForge'
}

export const MODDED_LOADERS = ['fabric', 'quilt', 'forge', 'neoforge'] as const

export const LOADER_MOD_TAGS: Record<string, string[]> = {
  fabric: ['fabric'],
  quilt: ['quilt', 'fabric'],
  forge: ['forge'],
  neoforge: ['neoforge']
}

export const LOADER_DESCRIPTIONS: Record<string, string> = {
  vanilla: '纯净体验，不加载任何模组，最稳定',
  fabric: '轻量、更新快，适合优化与轻量模组',
  quilt: '兼容 Fabric 生态，启动更快',
  forge: '老牌模组加载器，大型整合包常用',
  neoforge: 'Forge 的现代分支，适合新版本模组'
}
