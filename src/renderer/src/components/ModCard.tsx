import { Check, Download, Loader2, Package } from 'lucide-react'
import { useState } from 'react'
import type { ModSearchHit } from '../../../shared/types'
import { translateModText, translateModTitle } from '../../../shared/modI18n'
import { Badge } from './ui'
import { classNames, formatCompactNumber, formatRelative } from '../lib/format'

const CATEGORY_LABELS: Record<string, string> = {
  optimization: '优化',
  performance: '优化',
  technology: '科技',
  'API and Library': '前置库',
  'Adventure and RPG': '冒险',
  'Armor, Tools, and Weapons': '装备',
  'Bug Fixes': '修复',
  Biomes: '生物群系',
  Cosmetic: '装饰',
  Education: '教育',
  Energy: '能源',
  Farming: '农业',
  Food: '食物',
  'Magic': '魔法',
  'Map and Information': '地图信息',
  'Miscellaneous': '杂项',
  'Mobs': '生物',
  'Ores and Resources': '矿物资源',
  'Player Transport': '交通',
  'Redstone': '红石',
  'Server Utility': '服务器实用',
  Storage: '存储',
  'Utility & QoL': '实用',
  'World Gen': '世界生成',
  'World Structures': '结构',
  Automation: '自动化',
  magic: '魔法',
  adventure: '冒险',
  decoration: '装饰',
  worldgen: '世界生成',
  library: '前置库',
  management: '管理',
  utility: '实用',
  equipment: '装备',
  mobs: '生物',
  food: '食物',
  storage: '存储',
  transportation: '交通',
  'game-mechanics': '机制',
  combat: '战斗',
  building: '建筑',
  cosmetic: '外观',
  social: '社交',
  economy: '经济'
}

export function categoryLabel(id: string): string {
  return CATEGORY_LABELS[id] || id.replace(/-/g, ' ')
}

export function isLoaderTag(id: string): boolean {
  return ['fabric', 'forge', 'neoforge', 'quilt', 'liteloader', 'rift'].includes(id)
}

export function ModCard({
  project,
  installed,
  installing,
  canInstall,
  disabledReason,
  onInstall,
  onOpen,
  featured = false,
  translate = false
}: {
  project: ModSearchHit
  installed: boolean
  installing: boolean
  canInstall: boolean
  disabledReason?: string
  onInstall: () => void
  onOpen: () => void
  featured?: boolean
  translate?: boolean
}): React.JSX.Element {
  const [imageFailed, setImageFailed] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const category = (project.display_categories || project.categories || []).find(
    (item) => !isLoaderTag(item)
  )
  const displayTitle = translate ? translateModTitle(project) : project.title
  const displayDescription = translate
    ? translateModText(project.description || '')
    : project.description

  return (
    <article className={classNames('mod-card', featured && 'mod-card--featured')}>
      <button
        type="button"
        className="mod-card__hit"
        onClick={onOpen}
        aria-label={`查看模组 ${displayTitle}`}
      />
      <div className="mod-card__icon-wrap">
        <div className="mod-card__icon-fallback">
          <Package size={24} />
        </div>
        {project.icon_url && !imageFailed ? (
          <img
            className={classNames('mod-card__icon', imageLoaded && 'is-loaded')}
            src={project.icon_url}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageFailed(true)}
          />
        ) : null}
      </div>

      <div className="mod-card__body">
        <div className="mod-card__heading">
          <h3 title={project.title}>{displayTitle}</h3>
          {project.source === 'curseforge' ? <Badge tone="violet">CurseForge</Badge> : null}
          {category ? <Badge tone="outline">{categoryLabel(category)}</Badge> : null}
        </div>
        <p className="mod-card__description">{displayDescription || '这个项目还没有简介。'}</p>
        <div className="mod-card__meta">
          <span>
            <Download size={13} />
            {formatCompactNumber(project.downloads)}
          </span>
          <span className="mod-card__dot" />
          <span>更新于 {formatRelative(project.date_modified)}</span>
          {featured ? null : (
            <>
              <span className="mod-card__dot" />
              <span className="mod-card__loaders">
                {(project.loaders || []).filter((loader) => ['fabric', 'forge', 'neoforge', 'quilt'].includes(loader)).slice(0, 2).map((loader) => (
                  <span key={loader}>{loader === 'neoforge' ? 'NeoForge' : loader[0].toUpperCase() + loader.slice(1)}</span>
                ))}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="mod-card__action">
        <button
          type="button"
          className={classNames(
            'install-button',
            installed && 'is-installed',
            installing && 'is-installing'
          )}
          disabled={!canInstall || installed || installing}
          title={!canInstall ? disabledReason : installed ? '已安装到当前实例' : '安装到当前实例'}
          onClick={(event) => {
            event.stopPropagation()
            if (!installed && !installing && canInstall) onInstall()
          }}
        >
          {installing ? (
            <Loader2 size={14} className="spin" />
          ) : installed ? (
            <Check size={14} />
          ) : (
            <Download size={14} />
          )}
          <span>{installing ? '安装中' : installed ? '已安装' : '安装'}</span>
        </button>
      </div>
    </article>
  )
}
