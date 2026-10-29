import type { ThemeId } from '../../../shared/types'

export const THEME_STORAGE_KEY = 'fangjie-theme'

export interface ThemeOption {
  id: ThemeId
  name: string
  description: string
  background: string
  accent: string
}

export const THEMES: ThemeOption[] = [
  {
    id: 'moss',
    name: '苔原',
    description: '青柠与苔藓，方界的默认气质',
    background: '#0c110b',
    accent: '#c4f06a'
  },
  {
    id: 'ocean',
    name: '深海',
    description: '冷静的蓝绿，适合夜间长时间游玩',
    background: '#08131a',
    accent: '#6ce7ff'
  },
  {
    id: 'ember',
    name: '余烬',
    description: '暖橙与炭黑，像营火旁的存档夜',
    background: '#140e09',
    accent: '#ffb45f'
  }
]

export function cachedTheme(): ThemeId {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'ocean' || stored === 'ember' || stored === 'moss') return stored
  } catch {
    /* localStorage can be unavailable in hardened renderers */
  }
  return 'moss'
}

export function applyTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    /* the persisted setting remains the source of truth */
  }
}
