import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import type { TaskKind, TaskStatus, TaskView } from '../shared/types'

interface TaskRecord extends TaskView {
  cancel?: () => void
  lastEmit?: number
  pending?: NodeJS.Timeout
}

export class TaskManager extends EventEmitter {
  private readonly records = new Map<string, TaskRecord>()

  constructor() {
    super()
    this.setMaxListeners(30)
  }

  list(): TaskView[] {
    return [...this.records.values()]
      .sort((left, right) => right.createdAt - left.createdAt)
      .map(({ cancel: _cancel, lastEmit: _lastEmit, pending: _pending, ...task }) => ({ ...task }))
  }

  get(id: string): TaskView | undefined {
    return this.list().find((task) => task.id === id)
  }

  getRecord(id: string): TaskRecord | undefined {
    return this.records.get(id)
  }

  /**
   * Wait for an install task to reach a terminal state. Used by the update
   * transaction so it can restore the previous JAR when a download fails.
   */
  waitFor(id: string): Promise<TaskView> {
    const initial = this.get(id)
    if (!initial) return Promise.reject(new Error('任务不存在或已被清理'))
    if (isTerminal(initial.status)) {
      return initial.status === 'success'
        ? Promise.resolve(initial)
        : Promise.reject(new Error(initial.error || (initial.status === 'cancelled' ? '任务已取消' : '任务失败')))
    }

    return new Promise<TaskView>((resolve, reject) => {
      let settled = false
      const cleanup = (): void => {
        this.off('update', onUpdate)
      }
      const settle = (task: TaskView): void => {
        if (settled) return
        settled = true
        cleanup()
        if (task.status === 'success') resolve(task)
        else reject(new Error(task.error || (task.status === 'cancelled' ? '任务已取消' : '任务失败')))
      }
      const onUpdate = (tasks: TaskView[]): void => {
        const task = tasks.find((item) => item.id === id)
        if (!task) {
          if (!settled) {
            settled = true
            cleanup()
            reject(new Error('任务已结束，但找不到结果'))
          }
          return
        }
        if (isTerminal(task.status)) settle(task)
      }

      this.on('update', onUpdate)
      const current = this.get(id)
      if (current && isTerminal(current.status)) settle(current)
    })
  }

  create(input: {
    kind: TaskKind
    title: string
    subtitle?: string
    detail?: string
    instanceId?: string
    projectId?: string
    cancellable?: boolean
  }): string {
    const id = randomUUID()
    const task: TaskRecord = {
      id,
      kind: input.kind,
      title: input.title,
      subtitle: input.subtitle || '',
      detail: input.detail || '准备中…',
      progress: 0,
      status: 'queued',
      createdAt: Date.now(),
      instanceId: input.instanceId,
      projectId: input.projectId
    }
    this.records.set(id, task)
    this.emitAll()
    return id
  }

  start(id: string, detail?: string): void {
    const task = this.records.get(id)
    if (!task) return
    task.status = 'running'
    if (detail) task.detail = detail
    this.emitAll()
  }

  update(
    id: string,
    update: Partial<Pick<TaskView, 'progress' | 'detail' | 'subtitle' | 'bytesPerSecond' | 'title' | 'status'>>,
    options: { immediate?: boolean } = {}
  ): void {
    const task = this.records.get(id)
    if (!task || task.status === 'cancelled') return
    if (typeof update.progress === 'number') {
      task.progress = Math.max(task.progress, Math.min(100, Math.max(0, update.progress)))
    }
    if (update.detail !== undefined) task.detail = update.detail
    if (update.subtitle !== undefined) task.subtitle = update.subtitle
    if (update.title !== undefined) task.title = update.title
    if (update.status !== undefined) task.status = update.status
    if (update.bytesPerSecond !== undefined) task.bytesPerSecond = update.bytesPerSecond
    this.scheduleEmit(task, options.immediate)
  }

  setCancel(id: string, cancel: () => void): void {
    const task = this.records.get(id)
    if (task) task.cancel = cancel
  }

  finish(id: string, detail = '已完成', progress = 100): void {
    const task = this.records.get(id)
    if (!task) return
    task.status = 'success'
    task.detail = detail
    task.progress = progress
    task.endedAt = Date.now()
    task.bytesPerSecond = undefined
    this.emitAll()
  }

  fail(id: string, error: string): void {
    const task = this.records.get(id)
    if (!task) return
    if (task.status === 'cancelled') return
    task.status = 'error'
    task.detail = '安装失败'
    task.error = error
    task.endedAt = Date.now()
    task.bytesPerSecond = undefined
    this.emitAll()
  }

  cancel(id: string): boolean {
    const task = this.records.get(id)
    if (!task || !['queued', 'running', 'error'].includes(task.status)) return false
    const wasRunning = task.status === 'queued' || task.status === 'running'
    task.status = 'cancelled'
    task.detail = '已取消'
    task.endedAt = Date.now()
    task.bytesPerSecond = undefined
    try {
      task.cancel?.()
    } catch {
      /* cancellation is best effort */
    }
    this.emitAll()
    return wasRunning
  }

  isRunning(kind?: TaskKind): boolean {
    return [...this.records.values()].some(
      (task) => task.status === 'running' && (!kind || task.kind === kind)
    )
  }

  clearFinished(): void {
    for (const [id, task] of this.records) {
      if (['success', 'error', 'cancelled'].includes(task.status)) this.records.delete(id)
    }
    this.emitAll()
  }

  private scheduleEmit(task: TaskRecord, immediate?: boolean): void {
    if (immediate) {
      this.flush(task)
      return
    }
    const now = Date.now()
    if (now - (task.lastEmit || 0) > 120) {
      this.flush(task)
      return
    }
    if (task.pending) return
    task.pending = setTimeout(() => {
      task.pending = undefined
      this.flush(task)
    }, 150)
  }

  private flush(task: TaskRecord): void {
    if (task.pending) {
      clearTimeout(task.pending)
      task.pending = undefined
    }
    task.lastEmit = Date.now()
    this.emitAll()
  }

  private emitAll(): void {
    this.emit('update', this.list())
  }
}

function isTerminal(status: TaskStatus): boolean {
  return status === 'success' || status === 'error' || status === 'cancelled'
}
