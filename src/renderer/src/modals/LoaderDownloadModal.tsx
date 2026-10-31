import { useEffect, useRef, useState } from 'react'
import { Hammer, Layers, Puzzle, Zap } from 'lucide-react'
import type { LoaderAvailability, LoaderType, VersionSummary } from '../../../shared/types'
import { LOADER_LABEL } from '../../../shared/constants'
import { useLauncher } from '../state/LauncherContext'
import { Button, Field, InlineNotice, Modal, Select, Spinner } from '../components/ui'

const LOADER_ICONS = {
  fabric: <Puzzle size={19} />,
  quilt: <Layers size={19} />,
  forge: <Hammer size={19} />,
  neoforge: <Zap size={19} />
} as const

export function LoaderDownloadModal({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}): React.JSX.Element {
  const { toast, refresh } = useLauncher()
  const [versions, setVersions] = useState<VersionSummary[]>([])
  const [version, setVersion] = useState('')
  const [availability, setAvailability] = useState<LoaderAvailability[]>([])
  const [loader, setLoader] = useState<Exclude<LoaderType, 'vanilla'> | ''>('')
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef(0)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingVersions(true)
    setError('')
    void window.fangjie.versions(false).then((result) => {
      if (cancelled) return
      setLoadingVersions(false)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setVersions(result.value.versions)
      setVersion((current) => current || result.value.latest.release || result.value.versions[0]?.id || '')
    })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open || !version) return
    const id = ++requestId.current
    setChecking(true)
    setAvailability([])
    setLoader('')
    void window.fangjie.loaderAvailability(version).then((result) => {
      if (id !== requestId.current) return
      setChecking(false)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError('')
      setAvailability(result.value)
      const first = result.value.find((item) => item.available)
      setLoader(first?.loader || '')
    })
  }, [open, version])

  useEffect(() => {
    if (!open) {
      setVersions([])
      setAvailability([])
      setLoader('')
      setVersion('')
      setError('')
    }
  }, [open])

  const available = availability.filter((item) => item.available)
  const selected = available.find((item) => item.loader === loader)

  const install = async (): Promise<void> => {
    if (!version || !loader) return
    setInstalling(true)
    const result = await window.fangjie.installLoaderStandalone({
      mcVersion: version,
      loader
    })
    setInstalling(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast(`${LOADER_LABEL[loader]} ${result.value.loaderVersion} 已安装到共享版本目录`, 'success')
    await refresh()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="单独下载加载器"
      description="只把加载器安装到共享版本目录，不会创建实例。"
      size="md"
      footer={
        <>
          <div className="create-modal__footer-hint">
            需要该 Minecraft 版本的核心文件已经安装
          </div>
          <Button variant="ghost" onClick={onClose} disabled={installing}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={() => void install()}
            loading={installing}
            disabled={!version || !loader || checking}
          >
            下载并安装
          </Button>
        </>
      }
    >
      <div className="loader-download-form">
        <Field label="Minecraft 版本" hint="从已获取的版本列表中选择">
          {loadingVersions ? (
            <Spinner size={18} label="正在加载版本列表" />
          ) : (
            <Select value={version} onChange={(event) => setVersion(event.target.value)}>
              {versions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id}
                  {item.type !== 'release' ? ` · ${item.type}` : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {checking ? (
          <div className="loader-availability-note">
            <Spinner size={16} label="正在核对加载器版本" />
            正在核对这个游戏版本可用的加载器…
          </div>
        ) : null}

        {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}

        {!checking && version && !available.length && !error ? (
          <InlineNotice tone="warn" title="没有可单独安装的加载器">
            Minecraft {version} 暂时没有可用的模组加载器版本。
          </InlineNotice>
        ) : null}

        {available.length ? (
          <div className="loader-grid" role="radiogroup" aria-label="可用加载器">
            {available.map((item) => (
              <button
                key={item.loader}
                type="button"
                role="radio"
                aria-checked={loader === item.loader}
                className={`loader-option${loader === item.loader ? ' is-selected' : ''}`}
                onClick={() => setLoader(item.loader)}
              >
                <span className={`loader-option__icon loader-option__icon--${item.loader}`}>
                  {LOADER_ICONS[item.loader]}
                </span>
                <span className="loader-option__body">
                  <strong>{LOADER_LABEL[item.loader]}</strong>
                  <span>{item.latest ? `最新 ${item.latest}` : '可用'}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <p className="settings-hint">
          只会写入共享版本目录，不会新建实例，也不会改动任何实例的存档或模组。
        </p>
      </div>
    </Modal>
  )
}
