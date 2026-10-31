import { createHash, randomBytes } from 'node:crypto'
import { createWriteStream, mkdirSync, renameSync, rmSync } from 'node:fs'
import { once } from 'node:events'
import { basename, dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { isOffline } from './networkPolicy'
import { withNetworkSlot } from './networkQueue'

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

type ElectronNet = typeof import('electron').net

/**
 * Node's bundled CA store does not include corporate/user root certificates.
 * In Electron the Chromium network stack does, so use it as a TLS fallback
 * instead of surfacing the opaque `fetch failed` error to the updater.
 */
function electronNet(): ElectronNet | null {
  if (!process.versions.electron) return null
  try {
    const electron = require('electron') as typeof import('electron')
    return electron.net ?? null
  } catch {
    return null
  }
}

function isCertificateError(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } } | null)?.cause
  switch (cause?.code) {
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'CERT_HAS_EXPIRED':
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
      return true
    default:
      return false
  }
}

export async function requestResponse(url: string, init?: RequestInit): Promise<Response> {
  assertNetworkAllowed()
  return withNetworkSlot(async () => {
    try {
      return await fetch(url, init)
    } catch (error) {
      const net = electronNet()
      if (!net || !isCertificateError(error)) throw error
      return net.fetch(url, init)
    }
  })
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

function isReplaceConflict(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code
  return code === 'EEXIST' || code === 'EPERM' || code === 'ENOTEMPTY' || code === 'EACCES'
}

/**
 * A unique staging name means an interrupted download can never block the next
 * attempt. Windows antivirus/indexers can briefly lock a just-closed `.part`
 * file, so cleanup must also stay best-effort and must not replace the real
 * download error with EPERM.
 */
function temporaryPath(destination: string): string {
  return join(
    dirname(destination),
    `.${basename(destination)}.part-${process.pid}-${Date.now()}-${randomBytes(4).toString('hex')}`
  )
}

function safeRemove(path: string): void {
  try {
    rmSync(path, { force: true })
  } catch {
    /* locked by antivirus or another process; a later retry can remove it */
  }
}

function commitDownloadedFile(temporary: string, destination: string): void {
  try {
    renameSync(temporary, destination)
    return
  } catch (error) {
    if (!isReplaceConflict(error)) throw error
  }

  const displaced = `${destination}.replace-${process.pid}`
  safeRemove(displaced)
  let movedAside = false
  try {
    renameSync(destination, displaced)
    movedAside = true
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code !== 'ENOENT') throw error
  }

  try {
    renameSync(temporary, destination)
  } catch (error) {
    if (movedAside) {
      try {
        renameSync(displaced, destination)
      } catch {
        /* best effort restore; the original error is more useful */
      }
    }
    throw error
  }
  if (movedAside) safeRemove(displaced)
}

/**
 * Single bounded streaming download path used by Modrinth, CurseForge, assets,
 * modpacks and the updater. Proxy/IPv4 behavior comes from the global undici
 * dispatcher configured at startup.
 */
export async function downloadToFile(request: DownloadRequest): Promise<void> {
  assertNetworkAllowed()
  const temporary = temporaryPath(request.destination)
  mkdirSync(dirname(request.destination), { recursive: true })
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
    commitDownloadedFile(temporary, request.destination)
  } catch (error) {
    if (stream) {
      stream.destroy()
      if (!stream.closed) await once(stream, 'close').catch(() => undefined)
      stream = undefined
    }
    safeRemove(temporary)
    if (request.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    throw error
  }
}
