import { app } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { CoreStatus } from '../shared/types'
import type { Instance } from '../shared/types'
import type { LauncherStore } from './store'

const SIDECAR_EXE = 'fangjie-core-sidecar.exe'
const REQUEST_TIMEOUT_MS = 180_000

export interface RustInstance {
  id: string
  name: string
  root: string
  game_dir: string
  game_version: string
  loader: string
  loader_version?: string | null
  java_path?: string | null
  memory_mb: number
  jvm_args: string[]
  width?: number | null
  height?: number | null
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

interface CoreResponse {
  id?: string | null
  ok: boolean
  value?: unknown
  error?: string
}

/** Map the renderer/config instance record onto the Rust core `Instance`. */
export function toRustInstance(store: LauncherStore, instance: Instance): RustInstance {
  return {
    id: instance.id,
    name: instance.name,
    root: join(store.instancesPath, instance.id),
    game_dir: store.instanceGamePath(instance),
    game_version: instance.mcVersion,
    loader: instance.loader,
    loader_version: instance.loaderVersion || null,
    java_path: store.settings.javaPath || null,
    memory_mb: instance.memoryMb || store.settings.memoryMb,
    jvm_args: instance.jvmArgs || [],
    width: instance.width || null,
    height: instance.height || null
  }
}

function resolveSidecar(): string | null {
  if (process.platform !== 'win32') return null
  if (process.env.FJ_CORE_SIDECAR) return existsSync(process.env.FJ_CORE_SIDECAR) ? process.env.FJ_CORE_SIDECAR : null
  const candidates = [
    app.isPackaged
      ? join(process.resourcesPath, 'bin', SIDECAR_EXE)
      : join(app.getAppPath(), 'resources', 'bin', SIDECAR_EXE),
    join(process.cwd(), 'resources', 'bin', SIDECAR_EXE)
  ]
  return candidates.find((candidate) => existsSync(candidate)) || null
}

/**
 * Long-lived JSON-lines client for the Rust core. Keeping one process alive is
 * what allows a repair plan to be previewed, confirmed and rolled back without
 * serializing plan state through disk.
 */
export class RustCoreClient {
  private child: ChildProcessWithoutNullStreams | null = null
  private pending = new Map<string, PendingRequest>()
  private lastError = ''

  status(): CoreStatus {
    const path = resolveSidecar()
    if (!path) {
      return {
        available: false,
        error: 'Rust 核心未安装。请先运行 npm run build:core，或在发布包中使用完整版本。'
      }
    }
    return { available: true, path }
  }

  private start(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child
    const path = resolveSidecar()
    if (!path) {
      throw new Error(
        'Rust 核心未安装。请先运行 npm run build:core，或在发布包中使用完整版本。'
      )
    }
    const child = spawn(path, [], {
      cwd: app.isPackaged ? process.resourcesPath : app.getAppPath(),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }
    })
    this.child = child
    this.lastError = ''

    const lines = createInterface({ input: child.stdout })
    lines.on('line', (line) => {
      let response: CoreResponse
      try {
        response = JSON.parse(line) as CoreResponse
      } catch {
        return
      }
      if (!response.id) return
      const pending = this.pending.get(response.id)
      if (!pending) return
      this.pending.delete(response.id)
      clearTimeout(pending.timer)
      if (response.ok) pending.resolve(response.value)
      else pending.reject(new Error(response.error || 'Rust 核心返回未知错误'))
    })

    child.stderr.on('data', (chunk: Buffer) => {
      this.lastError = chunk.toString('utf8').trim().slice(-1000)
    })
    child.on('error', (error) => {
      this.failAll(new Error(`Rust 核心启动失败：${error.message}`))
    })
    child.on('exit', (code) => {
      this.child = null
      const suffix = this.lastError ? `：${this.lastError}` : ''
      this.failAll(new Error(`Rust 核心已退出（${code ?? 'unknown'}）${suffix}`))
    })
    return child
  }

  private failAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(error)
      this.pending.delete(id)
    }
  }

  async request<T>(op: string, payload: Record<string, unknown> = {}): Promise<T> {
    const child = this.start()
    const id = randomUUID()
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Rust 核心请求超时：${op}`))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer })
      try {
        child.stdin.write(`${JSON.stringify({ id, op, ...payload })}\n`)
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  stop(): void {
    const child = this.child
    this.child = null
    if (child) {
      try {
        child.stdin.end()
        child.kill()
      } catch {
        /* process may already be gone */
      }
    }
    this.failAll(new Error('Rust 核心已停止'))
  }
}
