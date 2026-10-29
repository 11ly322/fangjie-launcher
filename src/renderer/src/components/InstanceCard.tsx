import { Clock3, FolderOpen, Play, Square } from 'lucide-react'
import type { Instance } from '../../../shared/types'
import { LOADER_LABEL } from '../../../shared/constants'
import { InstanceEmblem } from './Artwork'
import { Badge, IconButton } from './ui'
import { classNames, formatPlaytime, formatRelative } from '../lib/format'

export function InstanceCard({
  instance,
  running,
  launching,
  onLaunch,
  onOpen,
  onOpenFolder,
  compact = false
}: {
  instance: Instance
  running: boolean
  launching: boolean
  onLaunch: () => void
  onOpen: () => void
  onOpenFolder?: () => void
  compact?: boolean
}): React.JSX.Element {
  return (
    <article
      className={classNames('instance-card', compact && 'instance-card--compact', running && 'is-running')}
      style={{ '--card-accent': instance.accent } as React.CSSProperties}
    >
      <button
        type="button"
        className="instance-card__hit"
        onClick={onOpen}
        aria-label={`打开实例 ${instance.name}`}
      />
      <div className="instance-card__art">
        <div className="instance-card__glow" />
        <InstanceEmblem accent={instance.accent} icon={instance.icon} size={compact ? 56 : 72} />
        <div className="instance-card__badges">
          <Badge tone={instance.loader !== 'vanilla' ? 'accent' : 'neutral'}>
            {LOADER_LABEL[instance.loader] || instance.loader}
          </Badge>
          {running ? (
            <Badge tone="success" className="live-badge">
              <span className="live-badge__dot" /> 运行中
            </Badge>
          ) : null}
        </div>
        {onOpenFolder ? (
          <div className="instance-card__folder">
            <IconButton
              label="打开实例文件夹"
              size="sm"
              onClick={(event) => {
                event.stopPropagation()
                onOpenFolder()
              }}
            >
              <FolderOpen size={15} />
            </IconButton>
          </div>
        ) : null}
      </div>

      <div className="instance-card__body">
        <div className="instance-card__title-row">
          <h3>{instance.name}</h3>
          <span className="instance-card__version">{instance.mcVersion}</span>
        </div>
        <div className="instance-card__meta">
          <span>
            <Clock3 size={13} />
            {instance.lastPlayedAt ? formatRelative(instance.lastPlayedAt) : '尚未启动'}
          </span>
          <span className="instance-card__dot" />
          <span>{formatPlaytime(instance.totalPlayTimeMs)}</span>
          {instance.mods.length > 0 ? (
            <>
              <span className="instance-card__dot" />
              <span>{instance.mods.length} 个模组</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="instance-card__actions">
        <button
          type="button"
          className={classNames('play-button', running && 'play-button--running')}
          onClick={(event) => {
            event.stopPropagation()
            onLaunch()
          }}
          disabled={launching}
          aria-label={running ? `结束 ${instance.name}` : `启动 ${instance.name}`}
        >
          {launching ? (
            <span className="play-button__spinner" />
          ) : running ? (
            <Square size={14} fill="currentColor" />
          ) : (
            <Play size={16} fill="currentColor" />
          )}
          <span>{launching ? '启动中' : running ? '结束' : '启动'}</span>
        </button>
      </div>
    </article>
  )
}
