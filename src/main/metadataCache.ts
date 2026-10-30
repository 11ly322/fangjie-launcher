import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { requestResponse } from './downloadSource'
import { isOffline } from './networkPolicy'

interface MetadataCacheFile<T> {
  version: 1
  key: string
  savedAt: number
  etag?: string
  data: T
}

let cacheRoot = ''

/** Set the disk cache root once at startup, after FJ_HOME/FJ_DATA are known. */
export function configureMetadataCache(dataPath: string): void {
  cacheRoot = join(dataPath, 'cache')
}

export function metadataCacheRoot(): string {
  return cacheRoot
}

function cachePath(key: string): string | undefined {
  if (!cacheRoot) return undefined
  const hash = createHash('sha256').update(key).digest('hex')
  return join(cacheRoot, 'metadata', `${hash}.json`)
}

export function readMetadataCache<T>(key: string): MetadataCacheFile<T> | undefined {
  const file = cachePath(key)
  if (!file || !existsSync(file)) return undefined
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<MetadataCacheFile<T>>
    if (
      !raw ||
      raw.version !== 1 ||
      raw.key !== key ||
      typeof raw.savedAt !== 'number' ||
      raw.data === undefined
    ) {
      return undefined
    }
    return {
      version: 1,
      key,
      savedAt: raw.savedAt,
      etag: typeof raw.etag === 'string' ? raw.etag : undefined,
      data: raw.data
    }
  } catch {
    return undefined
  }
}

export function writeMetadataCache<T>(key: string, data: T, etag?: string): void {
  const file = cachePath(key)
  if (!file) return
  try {
    mkdirSync(dirname(file), { recursive: true })
    const temporary = `${file}.${process.pid}.tmp`
    const payload: MetadataCacheFile<T> = {
      version: 1,
      key,
      savedAt: Date.now(),
      etag,
      data
    }
    writeFileSync(temporary, JSON.stringify(payload), 'utf8')
    renameSync(temporary, file)
  } catch {
    /* a metadata cache must never break the feature it accelerates */
  }
}

export function touchMetadataCache<T>(key: string, entry: MetadataCacheFile<T>): void {
  writeMetadataCache(key, entry.data, entry.etag)
}

export interface CachedJsonResult<T> {
  data: T
  fromCache: boolean
  notModified: boolean
}

interface CachedJsonOptions {
  key: string
  url: string
  ttlMs: number
  label: string
  headers?: Record<string, string>
  signal?: AbortSignal
}

function abortError(): Error {
  return new DOMException('Aborted', 'AbortError')
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(abortError())
      },
      { once: true }
    )
  })
}

/**
 * Cache JSON metadata on disk. Fresh entries are returned without touching the
 * network; expired entries revalidate with If-None-Match. Offline mode never
 * opens a socket, even for an expired entry.
 */
export async function fetchCachedJson<T>(options: CachedJsonOptions): Promise<CachedJsonResult<T>> {
  const { key, url, ttlMs, label, headers = {}, signal } = options
  const cached = readMetadataCache<T>(key)
  const offline = isOffline()
  const age = cached ? Date.now() - cached.savedAt : Number.POSITIVE_INFINITY

  if (!offline && cached && age < ttlMs) {
    return { data: cached.data, fromCache: true, notModified: false }
  }
  if (offline && cached) {
    return { data: cached.data, fromCache: true, notModified: false }
  }
  if (offline) {
    throw new Error(`离线模式已开启，${label}没有本地缓存`)
  }

  const timeout = AbortSignal.timeout(30_000)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...headers
  }
  if (cached?.etag) requestHeaders['If-None-Match'] = cached.etag

  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (signal?.aborted) throw abortError()
    try {
      const response = await requestResponse(url, { headers: requestHeaders, signal: combined })
      if (response.status === 304 && cached) {
        touchMetadataCache(key, cached)
        return { data: cached.data, fromCache: true, notModified: true }
      }
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get('retry-after') || 0)
        lastError = new Error(
          response.status === 429
            ? `${label}请求过于频繁，请稍后重试`
            : `${label}服务暂时不可用（${response.status}）`
        )
        await wait(Math.min(4000, Math.max(300, retryAfter * 1000, 350 * (attempt + 1))), signal)
        continue
      }
      if (!response.ok) {
        throw new Error(
          response.status === 404 ? `没有找到这个${label}项目` : `${label}请求失败（${response.status}）`
        )
      }
      const data = (await response.json()) as T
      const etag = response.headers.get('etag') || undefined
      writeMetadataCache(key, data, etag)
      return { data, fromCache: false, notModified: false }
    } catch (error) {
      if (signal?.aborted) throw error
      lastError = error
      if (error instanceof Error && /没有找到这个|请求失败/.test(error.message)) break
      if (attempt < 2) await wait(350 * (attempt + 1), signal)
    }
  }

  if (cached) return { data: cached.data, fromCache: true, notModified: false }
  throw lastError instanceof Error ? lastError : new Error(`无法连接${label}服务`)
}
