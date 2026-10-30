/**
 * One bounded queue for every HTTP request made by the launcher. Batch update
 * checks, mod downloads and API metadata all pass through here so a large
 * instance cannot open hundreds of sockets at once.
 *
 * A slot covers the request until response headers arrive. Streaming bodies are
 * consumed after the slot is released; that still bounds connection setup and
 * API concurrency without holding a slot for a multi-hundred-megabyte file.
 */

const DEFAULT_CONCURRENCY = 8

let concurrency = DEFAULT_CONCURRENCY
let active = 0
const waiting: Array<() => void> = []

export function configureNetworkConcurrency(value: number): void {
  const next = Math.floor(Number(value))
  concurrency = Number.isFinite(next) ? Math.min(64, Math.max(1, next)) : DEFAULT_CONCURRENCY
  drain()
}

export function networkConcurrency(): number {
  return concurrency
}

export async function withNetworkSlot<T>(work: () => Promise<T>): Promise<T> {
  await acquire()
  try {
    return await work()
  } finally {
    active -= 1
    drain()
  }
}

function acquire(): Promise<void> {
  if (active < concurrency) {
    active += 1
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    waiting.push(resolve)
  })
}

function drain(): void {
  while (active < concurrency && waiting.length > 0) {
    active += 1
    waiting.shift()?.()
  }
}
