import { setDefaultResultOrder } from 'node:dns'
import { Agent, ProxyAgent, setGlobalDispatcher, type Dispatcher } from 'undici'
import { USER_AGENT } from './version'

// Prefer IPv4 for both native fetch and the xmcl transfer agent. Some CDNs
// advertise IPv6 routes that connect but never deliver a response on local
// networks, which otherwise looks like an install that never finishes.
setDefaultResultOrder('ipv4first')

/**
 * Shared download dispatcher for the x-minecraft-launcher downloader.
 *
 * The default undici dispatcher has very generous header/body timeouts, which
 * lets a single stalled CDN request freeze an entire install. Keeping one
 * pooled dispatcher with explicit timeouts makes downloads retry instead.
 */
function createAgent(): Dispatcher {
  return new Agent({
    connections: 24,
    connect: { timeout: 20_000, family: 4 },
    headersTimeout: 30_000,
    bodyTimeout: 60_000,
    keepAliveTimeout: 12_000,
    keepAliveMaxTimeout: 30_000
  })
}

const dispatcher = createAgent()

// Native fetch (used for Modrinth/CurseForge/skin downloads) can otherwise
// select an IPv6 route that stalls on some regional CDNs.
setGlobalDispatcher(
  new Agent({
    connections: 16,
    connect: { timeout: 20_000, family: 4 },
    headersTimeout: 30_000,
    bodyTimeout: 120_000,
    keepAliveTimeout: 12_000,
    keepAliveMaxTimeout: 30_000
  })
)

export function configureNetwork(proxyUrl?: string): void {
  const normalized = (proxyUrl || '').trim()
  if (normalized && !/^https?:\/\//i.test(normalized)) {
    throw new Error('代理地址必须以 http:// 或 https:// 开头')
  }
  const next = normalized ? new ProxyAgent(normalized) : createAgent()
  setGlobalDispatcher(next)
  xmclDownloadAgent.dispatcher = next
}

export const xmclDownloadAgent = {
  dispatcher,
  /**
   * Some mirrors advertise range support but stall segmented requests. A
   * single-stream transfer is slower for huge assets but far more reliable,
   * and files are still downloaded concurrently in bounded batches.
   */
  rangePolicy: {
    computeRanges(total: number) {
      return [{ start: 0, end: total }]
    }
  }
} as any

export const XMCL_HEADERS = {
  'User-Agent': USER_AGENT
}
