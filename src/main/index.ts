import { app, BrowserWindow, Menu, shell } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { LauncherStore } from './store'
import { TaskManager } from './tasks'
import { registerIpcHandlers } from './ipc'
import { multiplayerManager } from './multiplayer'
import { installDownloadConcurrencyLimit } from './xmclPatch'

let mainWindow: BrowserWindow | null = null
let store: LauncherStore
let tasks: TaskManager

let logPath: string | null = null

function getLogPath(): string {
  if (!logPath) {
    const home = process.env.FJ_HOME
      ? process.env.FJ_HOME
      : (() => {
          try {
            return app.getPath('userData')
          } catch {
            return process.cwd()
          }
        })()
    logPath = join(home, 'launcher-main.log')
  }
  return logPath
}

function log(message: string, error?: unknown): void {
  try {
    const target = getLogPath()
    mkdirSync(dirname(target), { recursive: true })
    const suffix = error
      ? `\n${error instanceof Error ? error.stack || error.message : String(error)}`
      : ''
    appendFileSync(target, `[${new Date().toISOString()}] ${message}${suffix}\n`, 'utf8')
  } catch {
    /* logging must never crash the launcher */
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  log('single instance lock not acquired; quitting')
  app.quit()
}

function createWindow(): void {
  log('creating main window')
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    frame: false,
    backgroundColor: '#0b0e0b',
    title: '方界启动器',
    icon: join(__dirname, '../../resources/icon.png'),
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    log('main window ready-to-show')
    mainWindow?.show()
  })

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:state', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:state', false)
  })
  mainWindow.on('closed', () => {
    log('main window closed event')
    mainWindow = null
  })
  mainWindow.on('unresponsive', () => {
    log('main window unresponsive')
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log('renderer process gone', details)
  })
  mainWindow.webContents.on('unresponsive', () => {
    log('renderer unresponsive')
  })
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    log(`did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl && url.startsWith(devUrl)) return
    event.preventDefault()
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url)
    }
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

app.whenReady().then(() => {
  log('app ready')
  app.setAppUserModelId('com.fangjie.launcher')
  app.setName('方界启动器')
  Menu.setApplicationMenu(null)
  installDownloadConcurrencyLimit(20)

  store = new LauncherStore()
  tasks = new TaskManager()
  registerIpcHandlers({ store, tasks, getMainWindow })
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('second-instance', () => {
  log('second instance requested focus')
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.on('window-all-closed', () => {
  log('window-all-closed event')
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  log('before-quit event')
  multiplayerManager.dispose()
  store?.save()
})

app.on('child-process-gone', (_event, details) => {
  log(`child process gone ${details.type} ${details.reason} exitCode=${details.exitCode}`)
})

process.on('uncaughtException', (error) => {
  log('uncaught exception', error)
  console.error('[fangjie] uncaught exception', error)
})

process.on('unhandledRejection', (error) => {
  log('unhandled rejection', error)
  console.error('[fangjie] unhandled rejection', error)
})

process.on('exit', (code) => {
  log(`process exit code=${code}`)
})
