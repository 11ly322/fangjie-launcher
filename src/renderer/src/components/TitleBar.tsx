import { Maximize2, Minus, Square, X } from 'lucide-react'
import { useEffect, useState } from 'react'

export function TitleBar({ pageLabel }: { pageLabel: string }): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const unsubscribe = window.fangjie.onWindowState((value) => setMaximized(value))
    return unsubscribe
  }, [])

  return (
    <header className="titlebar">
      <div className="titlebar__drag">
        <span className="titlebar__label">{pageLabel}</span>
        <span className="titlebar__sep" />
        <span className="titlebar__hint">方界 · 本地启动器</span>
      </div>
      <div className="titlebar__controls">
        <button
          type="button"
          className="window-button"
          aria-label="最小化"
          title="最小化"
          onClick={() => void window.fangjie.windowAction('minimize')}
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          className="window-button"
          aria-label={maximized ? '还原' : '最大化'}
          title={maximized ? '还原' : '最大化'}
          onClick={() => void window.fangjie.windowAction('maximize')}
        >
          {maximized ? <Square size={12} /> : <Maximize2 size={13} />}
        </button>
        <button
          type="button"
          className="window-button window-button--close"
          aria-label="关闭"
          title="关闭"
          onClick={() => void window.fangjie.windowAction('close')}
        >
          <X size={16} />
        </button>
      </div>
    </header>
  )
}
