import {
  AlertTriangle,
  Check,
  Info,
  X
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import type { Bootstrap, LogLine, ProjectType, Settings, TaskView } from '../../shared/types'
import { PAGE_LABELS, type PageName } from './lib/navigation'
import { applyColorMode, applyTheme } from './lib/theme'
import {
  LauncherContext,
  type ConfirmOptions,
  type LaunchError,
  type ToastItem,
  type ToastTone
} from './state/LauncherContext'
import { AppNav } from './components/AppNav'
import { TitleBar } from './components/TitleBar'
import { BrandMark } from './components/Artwork'
import { Button, Modal, Spinner } from './components/ui'
import { HomePage } from './pages/HomePage'
import { InstancesPage } from './pages/InstancesPage'
import { InstanceDetailPage } from './pages/InstanceDetailPage'
import { ModsPage } from './pages/ModsPage'
import { MultiplayerPage } from './pages/MultiplayerPage'
import { DownloadsPage } from './pages/DownloadsPage'
import { SettingsPage } from './pages/SettingsPage'
import { CreateInstanceModal } from './modals/CreateInstanceModal'
import { AccountModal } from './modals/AccountModal'
import { useGamepad } from './lib/useGamepad'

interface ConfirmState {
  options: ConfirmOptions
  resolve: (value: boolean) => void
}

export default function App(): React.JSX.Element {
  const [boot, setBoot] = useState<Bootstrap | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [tasks, setTasks] = useState<TaskView[]>([])
  const [running, setRunning] = useState<Set<string>>(new Set())
  const [launching, setLaunching] = useState<Set<string>>(new Set())
  const [logs, setLogs] = useState<Record<string, LogLine[]>>({})
  const [page, setPage] = useState<PageName>('home')
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null)
  const [modsInstanceId, setModsInstanceId] = useState<string | null>(null)
  const [modsProjectType, setModsProjectType] = useState<ProjectType>('mod')
  const [createOpen, setCreateOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [launchError, setLaunchError] = useState<LaunchError | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  const bootRef = useRef<Bootstrap | null>(null)
  const refreshTimer = useRef<number | null>(null)
  const toastTimers = useRef(new Map<string, number>())

  const toast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = crypto.randomUUID()
    setToasts((current) => [...current.slice(-3), { id, message, tone }])
    const timer = window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
      toastTimers.current.delete(id)
    }, 4200)
    toastTimers.current.set(id, timer)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id))
    const timer = toastTimers.current.get(id)
    if (timer) window.clearTimeout(timer)
    toastTimers.current.delete(id)
  }, [])

  const refresh = useCallback(async () => {
    if (!window.fangjie) return
    const result = await window.fangjie.snapshot()
    if (!result.ok) return
    const snapshot = result.value
    setBoot((current) =>
      current
        ? {
            ...current,
            ...snapshot
          }
        : current
    )
    bootRef.current = bootRef.current ? { ...bootRef.current, ...snapshot } : bootRef.current
    setTasks(snapshot.tasks)
    setRunning(new Set(snapshot.runningInstanceIds))
    setActiveInstanceId((current) => {
      if (current && snapshot.instances.some((instance) => instance.id === current)) return current
      return pickDefaultInstance(snapshot.instances)
    })
    setModsInstanceId((current) => {
      if (
        current &&
        snapshot.instances.some(
          (instance) => instance.id === current && instance.loader !== 'vanilla'
        )
      ) {
        return current
      }
      return snapshot.instances.find((instance) => instance.loader !== 'vanilla')?.id || null
    })
  }, [])

  const refreshJava = useCallback(async () => {
    const result = await window.fangjie.refreshJava()
    if (!result.ok) {
      toast(result.error, 'error')
      return
    }
    setBoot((current) => (current ? { ...current, java: result.value } : current))
    if (bootRef.current) bootRef.current = { ...bootRef.current, java: result.value }
  }, [toast])

  const loadBootstrap = useCallback(async () => {
    setBootError(null)
    if (!window.fangjie) {
      setBootError('启动器桥接未加载，请重新启动应用')
      return
    }
    const result = await window.fangjie.bootstrap()
    if (!result.ok) {
      setBootError(result.error)
      return
    }
    const value = result.value
    setBoot(value)
    bootRef.current = value
    setTasks(value.tasks)
    setRunning(new Set(value.runningInstanceIds))
    setActiveInstanceId((current) => {
      if (current && value.instances.some((instance) => instance.id === current)) return current
      return pickDefaultInstance(value.instances)
    })
    setModsInstanceId(value.instances.find((instance) => instance.loader !== 'vanilla')?.id || null)
  }, [])

  useEffect(() => {
    void loadBootstrap()
  }, [loadBootstrap])

  useEffect(() => {
    if (!boot) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && bootRef.current) void refresh()
    }, 8000)
    const onFocus = (): void => {
      if (bootRef.current) void refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [boot, refresh])

  useEffect(() => {
    if (!boot) return
    const unsubscribeTasks = window.fangjie.onTasks((next) => setTasks(next))
    const unsubscribeJava = window.fangjie.onJavaUpdated((status) => {
      setBoot((current) => (current ? { ...current, java: status } : current))
      if (bootRef.current) bootRef.current = { ...bootRef.current, java: status }
    })
    const unsubscribeData = window.fangjie.onDataChanged((reason) => {
      if (reason === 'instance-created') void refreshJava()
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current)
      refreshTimer.current = window.setTimeout(() => {
        void refresh()
      }, 180)
    })
    const unsubscribeLog = window.fangjie.onLog((line) => {
      setLogs((current) => {
        const previous = current[line.instanceId] || []
        return {
          ...current,
          [line.instanceId]: [...previous.slice(-249), line]
        }
      })
    })
    return () => {
      unsubscribeTasks()
      unsubscribeJava()
      unsubscribeData()
      unsubscribeLog()
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current)
    }
  }, [boot, refresh, refreshJava])

  const recordLaunchState = useCallback(
    (state: import('../../shared/types').LaunchState) => {
      const instance = bootRef.current?.instances.find((item) => item.id === state.instanceId)
      const name = instance?.name || '游戏'
      if (state.status === 'launching') {
        setLaunching((current) => new Set(current).add(state.instanceId))
        return
      }
      if (state.status === 'running') {
        setRunning((current) => new Set(current).add(state.instanceId))
        setLaunching((current) => {
          const next = new Set(current)
          next.delete(state.instanceId)
          return next
        })
        toast(`${name} 已启动`, 'success')
        return
      }
      setRunning((current) => {
        const next = new Set(current)
        next.delete(state.instanceId)
        return next
      })
      setLaunching((current) => {
        const next = new Set(current)
        next.delete(state.instanceId)
        return next
      })
      if (state.status === 'error') {
        setLaunchError({
          instanceId: state.instanceId,
          instanceName: name,
          message: state.message || '游戏启动失败'
        })
        toast(`${name} 启动失败`, 'error')
        void refresh()
      } else {
        toast(state.message || '游戏已结束', 'info')
        void refresh()
      }
    },
    [refresh, toast]
  )

  useEffect(() => {
    if (!boot) return
    const unsubscribe = window.fangjie.onLaunchState(recordLaunchState)
    return unsubscribe
  }, [boot, recordLaunchState])

  useEffect(() => {
    const main = document.getElementById('main-content')
    if (main) main.scrollTop = 0
  }, [page, activeInstanceId])

  useEffect(() => {
    if (page === 'instance' && !activeInstanceId && boot) {
      setPage('instances')
    }
  }, [page, activeInstanceId, boot])

  useEffect(() => {
    if (activeInstanceId || !boot) return
    setActiveInstanceId(pickDefaultInstance(boot.instances))
  }, [activeInstanceId, boot])

  useEffect(() => {
    if (!boot) return
    applyTheme(boot.settings.theme)
    applyColorMode(boot.settings.colorMode)
  }, [boot?.settings.theme, boot?.settings.colorMode])

  useEffect(() => {
    if (boot) {
      const name = activeInstanceId
        ? boot.instances.find((instance) => instance.id === activeInstanceId)?.name
        : undefined
      document.title = name ? `${name} · UBL` : 'unflod bindery launcher'
    }
    return undefined
  }, [boot, activeInstanceId])

  const navigate = useCallback(
    (nextPage: PageName) => {
      if (nextPage === 'mods' && !modsInstanceId) {
        const fallback = bootRef.current?.instances.find((instance) => instance.loader !== 'vanilla')
        if (fallback) setModsInstanceId(fallback.id)
      }
      setPage(nextPage)
    },
    [modsInstanceId]
  )

  const gamepad = useGamepad({
    onBack: () => {
      if (page === 'instance') {
        navigate('instances')
      } else if (page !== 'home') {
        navigate('home')
      }
    }
  })

  const openInstance = useCallback((id: string) => {
    setActiveInstanceId(id)
    setPage('instance')
  }, [])

  const selectInstance = useCallback((id: string) => {
    setActiveInstanceId(id)
  }, [])

  const openMods = useCallback((instanceId?: string, projectType?: ProjectType) => {
    const instances = bootRef.current?.instances || []
    const candidate = instanceId
      ? instances.find((instance) => instance.id === instanceId && instance.loader !== 'vanilla')
      : instances.find((instance) => instance.id === activeInstanceId && instance.loader !== 'vanilla') ||
        instances.find((instance) => instance.loader !== 'vanilla')
    if (candidate) setModsInstanceId(candidate.id)
    if (projectType) setModsProjectType(projectType)
    setPage('mods')
  }, [activeInstanceId])

  const launch = useCallback(
    async (id: string) => {
      if (running.has(id)) {
        await stop(id)
        return
      }
      if (launching.has(id)) return
      setLaunching((current) => new Set(current).add(id))
      const result = await window.fangjie.launchInstance(id)
      if (!result.ok) {
        setLaunching((current) => {
          const next = new Set(current)
          next.delete(id)
          return next
        })
        const instance = bootRef.current?.instances.find((item) => item.id === id)
        setLaunchError({
          instanceId: id,
          instanceName: instance?.name || '游戏',
          message: result.error
        })
      }
    },
    // stop is defined below and stable enough for this action
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [running, launching]
  )

  const stop = useCallback(
    async (id: string) => {
      const result = await window.fangjie.stopInstance(id)
      if (!result.ok) toast(result.error, 'error')
    },
    [toast]
  )

  const saveSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const result = await window.fangjie.updateSettings(patch)
      if (!result.ok) {
        toast(result.error, 'error')
        return false
      }
      setBoot((current) => (current ? { ...current, settings: result.value } : current))
      if (bootRef.current) bootRef.current = { ...bootRef.current, settings: result.value }
      toast('设置已保存', 'success')
      if ('javaPath' in patch) void refreshJava()
      return true
    },
    [refreshJava, toast]
  )

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ options, resolve })
    })
  }, [])

  const settleConfirm = useCallback(
    (value: boolean) => {
      if (confirmState) {
        confirmState.resolve(value)
        setConfirmState(null)
      }
    },
    [confirmState]
  )

  const exitLauncher = useCallback(async () => {
    const approved = await confirm({
      title: '退出启动器？',
      description: running.size
        ? '启动器会退出，正在运行的游戏进程不会被强制结束。下次打开启动器时可以继续管理实例。'
        : '退出后下载中的任务会停止；已经完成的文件不会被删除。',
      confirmLabel: '退出'
    })
    if (!approved) return
    const result = await window.fangjie.windowAction('close')
    if (!result.ok) toast(result.error, 'error')
  }, [confirm, running, toast])

  const requestDeleteInstance = useCallback(
    async (id: string, keepSnapshots = false) => {
      const instance = bootRef.current?.instances.find((item) => item.id === id)
      if (!instance) return
      const approved = await confirm({
        title: `删除「${instance.name}」？`,
        description: keepSnapshots
          ? '这会删除该实例的存档、模组、配置和日志，但世界快照会先迁移到数据目录的 snapshots-archive。此操作无法撤销。'
          : '这会删除该实例的存档、模组、配置、日志和世界快照。已下载的共享游戏版本与运行库会保留。此操作无法撤销。',
        confirmLabel: keepSnapshots ? '保留快照并删除' : '删除实例',
        danger: true
      })
      if (!approved) return
      const result = await window.fangjie.deleteInstance(id, keepSnapshots)
      if (!result.ok) {
        toast(result.error, 'error')
        return
      }
      toast('实例已删除', 'success')
      setActiveInstanceId((current) => (current === id ? null : current))
      setModsInstanceId((current) => (current === id ? null : current))
      setPage('instances')
      await refresh()
    },
    [confirm, refresh, toast]
  )

  const activeInstance = useMemo(
    () => boot?.instances.find((instance) => instance.id === activeInstanceId) || null,
    [boot, activeInstanceId]
  )

  const contextValue = useMemo(() => {
    if (!boot) return null
    return {
      boot,
      tasks,
      running,
      launching,
      page,
      activeInstanceId,
      activeInstance,
      modsInstanceId,
      modsProjectType,
      logs,
      createOpen,
      accountOpen,
      launchError,
      navigate,
      openInstance,
      selectInstance,
      openMods,
      openCreateInstance: () => setCreateOpen(true),
      closeCreateInstance: () => setCreateOpen(false),
      openAccount: () => setAccountOpen(true),
      closeAccount: () => setAccountOpen(false),
      setModsInstanceId,
      refresh,
      refreshJava,
      saveSettings,
      launch,
      stop,
      requestDeleteInstance,
      toast,
      confirm,
      closeLaunchError: () => setLaunchError(null),
      recordLaunchState
    }
  }, [
    boot,
    tasks,
    running,
    launching,
    page,
    activeInstanceId,
    activeInstance,
    modsInstanceId,
    modsProjectType,
    logs,
    createOpen,
    accountOpen,
    launchError,
    navigate,
    openInstance,
    selectInstance,
    openMods,
    refresh,
    refreshJava,
    saveSettings,
    launch,
    stop,
    requestDeleteInstance,
    toast,
    confirm,
    recordLaunchState
  ])

  if (!boot || !contextValue) {
    return <BootScreen error={bootError} onRetry={() => void loadBootstrap()} />
  }

  const title =
    page === 'instance' && activeInstance ? activeInstance.name : PAGE_LABELS[page]

  return (
    <LauncherContext.Provider value={contextValue}>
      <div className="app-shell app-shell--topnav">
        <TitleBar pageLabel={title} />
        <AppNav
          page={page}
          onNavigate={navigate}
          account={boot.account}
          tasks={tasks}
          activeInstance={activeInstance}
          running={activeInstance ? running.has(activeInstance.id) : false}
          launching={activeInstance ? launching.has(activeInstance.id) : false}
          onLaunch={() => {
            if (activeInstance) void launch(activeInstance.id)
          }}
          onOpenActive={() => {
            if (activeInstance) openInstance(activeInstance.id)
            else setPage('home')
          }}
          onAccountClick={() => setAccountOpen(true)}
          onExit={() => void exitLauncher()}
          gamepadConnected={gamepad.connected}
        />
        <main className="main-scroll" id="main-content">
          {page === 'home' ? <HomePage /> : null}
          {page === 'instances' ? <InstancesPage /> : null}
          {page === 'instance' && activeInstance ? (
            <InstanceDetailPage instance={activeInstance} />
          ) : null}
          {page === 'mods' ? <ModsPage /> : null}
          {page === 'multiplayer' ? <MultiplayerPage /> : null}
          {page === 'downloads' ? <DownloadsPage /> : null}
          {page === 'settings' ? <SettingsPage /> : null}
        </main>

        <CreateInstanceModal open={createOpen} onClose={() => setCreateOpen(false)} />
        <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} />

        <Modal
          open={Boolean(confirmState)}
          onClose={() => settleConfirm(false)}
          title={confirmState?.options.title || ''}
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => settleConfirm(false)}>
                {confirmState?.options.cancelLabel || '取消'}
              </Button>
              <Button
                variant={confirmState?.options.danger ? 'danger' : 'primary'}
                onClick={() => settleConfirm(true)}
              >
                {confirmState?.options.confirmLabel || '确认'}
              </Button>
            </>
          }
        >
          <p className="modal-copy">{confirmState?.options.description}</p>
        </Modal>

        <Modal
          open={Boolean(launchError)}
          onClose={() => setLaunchError(null)}
          title="游戏没有成功启动"
          description={launchError ? `「${launchError.instanceName}」` : undefined}
          size="md"
          footer={
            <>
              <Button variant="ghost" onClick={() => setLaunchError(null)}>
                关闭
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  if (!launchError) return
                  void window.fangjie.openLogsFolder(launchError.instanceId)
                }}
              >
                打开日志文件夹
              </Button>
            </>
          }
        >
          <div className="error-panel">
            <AlertTriangle size={20} />
            <p>{launchError?.message}</p>
          </div>
          <p className="modal-hint">
            如果问题持续出现，请检查实例是否完整、Java 版本是否匹配，或在设置中手动指定 Java。
          </p>
        </Modal>

        <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      </div>
    </LauncherContext.Provider>
  )
}

function pickDefaultInstance(instances: Bootstrap['instances']): string | null {
  if (!instances.length) return null
  return [...instances].sort((left, right) => {
    const leftTime = left.lastPlayedAt || left.createdAt
    const rightTime = right.lastPlayedAt || right.createdAt
    return rightTime - leftTime
  })[0].id
}

function ToastViewport({
  toasts,
  onDismiss
}: {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}): React.JSX.Element {
  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="false">
      {toasts.map((item) => (
        <div key={item.id} className={`toast toast--${item.tone}`}>
          <span className="toast__icon">
            {item.tone === 'success' ? (
              <Check size={16} />
            ) : item.tone === 'error' ? (
              <AlertTriangle size={16} />
            ) : (
              <Info size={16} />
            )}
          </span>
          <span className="toast__message">{item.message}</span>
          <button type="button" className="toast__close" onClick={() => onDismiss(item.id)} aria-label="关闭提示">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

function BootScreen({
  error,
  onRetry
}: {
  error: string | null
  onRetry: () => void
}): React.JSX.Element {
  return (
    <div className="boot-screen">
      <div className="boot-screen__glow" />
      <div className="boot-screen__brand">
        <BrandMark size={56} />
        <span>UBL</span>
      </div>
      {error ? (
        <div className="boot-screen__error">
          <AlertTriangle size={20} />
          <h1>启动器还没有准备好</h1>
          <p>{error}</p>
          <Button variant="primary" onClick={onRetry}>
            重新加载
          </Button>
        </div>
      ) : (
        <div className="boot-screen__loading">
          <Spinner size={22} label="正在加载启动器" />
          <p>正在准备你的世界…</p>
          <div className="boot-screen__blocks" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      )}
    </div>
  )
}
