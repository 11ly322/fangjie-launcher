import { createContext, useContext } from 'react'
import type {
  Bootstrap,
  InstanceSummary,
  LaunchState,
  LogLine,
  ProjectType,
  Settings,
  TaskView
} from '../../../shared/types'
import type { PageName } from '../lib/navigation'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  message: string
  tone: ToastTone
}

export interface ConfirmOptions {
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

export interface LaunchError {
  instanceId: string
  instanceName: string
  message: string
}

export interface LauncherContextValue {
  boot: Bootstrap
  tasks: TaskView[]
  running: Set<string>
  launching: Set<string>
  page: PageName
  activeInstanceId: string | null
  activeInstance: InstanceSummary | null
  modsInstanceId: string | null
  modsProjectType: ProjectType
  logs: Record<string, LogLine[]>
  createOpen: boolean
  accountOpen: boolean
  launchError: LaunchError | null
  navigate: (page: PageName) => void
  openInstance: (id: string) => void
  selectInstance: (id: string) => void
  openMods: (instanceId?: string, projectType?: ProjectType) => void
  openCreateInstance: () => void
  closeCreateInstance: () => void
  openAccount: () => void
  closeAccount: () => void
  setModsInstanceId: (id: string | null) => void
  refresh: () => Promise<void>
  refreshJava: () => Promise<void>
  saveSettings: (patch: Partial<Settings>) => Promise<boolean>
  launch: (id: string) => Promise<void>
  stop: (id: string) => Promise<void>
  requestDeleteInstance: (id: string, keepSnapshots?: boolean) => Promise<void>
  toast: (message: string, tone?: ToastTone) => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
  closeLaunchError: () => void
  recordLaunchState: (state: LaunchState) => void
}

export const LauncherContext = createContext<LauncherContextValue | null>(null)

export function useLauncher(): LauncherContextValue {
  const value = useContext(LauncherContext)
  if (!value) throw new Error('useLauncher must be used inside LauncherContext.Provider')
  return value
}
