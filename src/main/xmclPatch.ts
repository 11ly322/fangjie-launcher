import { TaskGroup } from '@xmcl/task'

type OriginalAll = (
  tasks: any[],
  options?: {
    throwErrorImmediately?: boolean
    getErrorMessage?: (errors: any[]) => string
  }
) => Promise<any[]>

let installed = false

/**
 * @xmcl/installer starts every asset download at once. A full Minecraft install
 * can enqueue thousands of file tasks, exhausting file handles and memory inside
 * Electron. Run them in bounded batches instead while keeping the task tree
 * progress callbacks intact.
 */
export function installDownloadConcurrencyLimit(concurrency = 20): void {
  if (installed) return
  installed = true

  const prototype = TaskGroup.prototype as unknown as {
    all: OriginalAll
    __fangjieLimited?: boolean
  }
  if (prototype.__fangjieLimited) return
  const original = prototype.all
  if (typeof original !== 'function') return

  prototype.all = async function limitedAll(
    this: TaskGroup,
    tasks: any[],
    options: {
      throwErrorImmediately?: boolean
      getErrorMessage?: (errors: any[]) => string
    } = {}
  ): Promise<any[]> {
    if (!Array.isArray(tasks) || tasks.length <= concurrency) {
      return original.call(this, tasks, options)
    }

    const immediate = options.throwErrorImmediately === true
    const results: any[] = []
    const collected: any[] = []

    for (let index = 0; index < tasks.length; index += concurrency) {
      const batch = tasks.slice(index, index + concurrency)
      try {
        const batchResults = await original.call(this, batch, options)
        results.push(...batchResults)
      } catch (error) {
        if (immediate) throw error
        collected.push(...flattenErrors(error))
        results.push(...batch.map(() => undefined))
      }
    }

    if (collected.length > 0) {
      const message = options.getErrorMessage?.(collected) || 'Some download tasks failed'
      throw new AggregateError(collected, message)
    }
    return results
  }
  prototype.__fangjieLimited = true
}

function flattenErrors(error: unknown): any[] {
  if (error instanceof AggregateError) {
    return error.errors.flatMap((item) => flattenErrors(item))
  }
  return [error]
}
