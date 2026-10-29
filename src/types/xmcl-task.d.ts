declare module '@xmcl/task' {
  export class TaskGroup<T = unknown> {
    all(
      tasks: Array<Task<any>>,
      options?: {
        throwErrorImmediately?: boolean
        getErrorMessage?: (errors: any[]) => string
      }
    ): Promise<any[]>
  }

  export interface Task<T = unknown> {
    readonly id: number
    readonly name: string
    readonly path: string
    readonly total: number
    readonly progress: number
    startAndWait(handlers?: {
      onStart?: (task: Task<any>) => void
      onUpdate?: (task: Task<any>, chunkSize: number) => void
      onFailed?: (task: Task<any>, error: unknown) => void
      onSucceed?: (task: Task<any>, result: T) => void
      onCancelled?: (task: Task<any>) => void
      onPaused?: (task: Task<any>) => void
      onResumed?: (task: Task<any>) => void
    }): Promise<T>
    cancel(): void
  }
}
