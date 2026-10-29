import { createHash } from 'node:crypto'
import { createWriteStream, mkdirSync, renameSync, rmSync } from 'node:fs'
import { once } from 'node:events'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { isOffline } from './networkPolicy'

export interface DownloadRequest {
  url: string
  destination: string
  expectedSha1?: string
  expectedSha256?: string
  expectedSize?: number
  signal?: AbortSignal
  headers?: Record<string, string>
  onChunk?: (bytes: number) => void
}

export interface JsonRequest {
  url: string
  headers?: Record<string, string>
  signal?: AbortSignal
}

export async function requestResponse(url: string, init?: RequestInit): Promise<Response> {
  assertNetworkAllowed()
  return fetch(url, init)
}

function assertNetworkAllowed(): void {
  if (isOffline()) throw new Error('离线模式已开启，已阻止网络请求')
}

export async function fetchJson<T>(request: JsonRequest): Promise<T> {
  assertNetworkAllowed()
  const response = await requestResponse(request.url, {
    headers: request.headers,
    signal: request.signal,
    redirect: 'follow'
  })
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${request.url}`)
  return (await response.json()) as T
}

/**
 * Single bounded streaming download path used by Modrinth, CurseForge, assets,
 * modpacks and the updater. Proxy/IPv4 behavior comes from the global undici
 * dispatcher configured at startup.
 */
export async function downloadToFile(request: DownloadRequest): Promise<void> {
  assertNetworkAllowed()
  const temporary = `${request.destination}.part-${process.pid}`
  mkdirSync(dirname(request.destination), { recursive: true })
  rmSync(temporary, { force: true })
  let stream: ReturnType<typeof createWriteStream> | undefined
  try {
    const response = await requestResponse(request.url, {
      headers: request.headers,
      signal: request.signal,
      redirect: 'follow'
    })
    if (!response.ok || !response.body) {
      throw new Error(`下载失败（HTTP ${response.status}）`)
    }
    const sha1 = createHash('sha1')
    const sha256 = createHash('sha256')
    let total = 0
    stream = createWriteStream(temporary)
    const reader = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])
    for await (const chunk of reader) {
      if (request.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
      sha1.update(buffer)
      sha256.update(buffer)
      total += buffer.length
      if (!stream.write(buffer)) await once(stream, 'drain')
      request.onChunk?.(buffer.length)
    }
    stream.end()
    await once(stream, 'finish')
    stream = undefined
    if (request.expectedSize && total !== request.expectedSize) {
      throw new Error(`文件大小不匹配：期望 ${request.expectedSize}，实际 ${total}`)
    }
    if (request.expectedSha1 && sha1.digest('hex') !== request.expectedSha1.toLowerCase()) {
      throw new Error('文件 SHA1 校验失败')
    }
    if (request.expectedSha256 && sha256.digest('hex') !== request.expectedSha256.toLowerCase()) {
      throw new Error('文件 SHA256 校验失败')
    }
    rmSync(request.destination, { force: true })
    renameSync(temporary, request.destination)
  } catch (error) {
    stream?.destroy()
    rmSync(temporary, { force: true })
    if (request.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    throw error
  }
}
