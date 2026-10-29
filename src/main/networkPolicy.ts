let offline = false

export function setOffline(enabled: boolean): void {
  offline = Boolean(enabled)
}

export function isOffline(): boolean {
  return offline
}

export function assertOnline(action: string): void {
  if (offline) throw new Error('离线模式已开启，无法' + action)
}

let guardInstalled = false

/**
 * Gate every native fetch (project APIs, metadata, OAuth token exchange,
 * updater feed, skins) at one seam. xmcl uses its own dispatcher and is gated
 * through the IPC network-channel list plus Java/installer entry points.
 */
export function installFetchGuard(): void {
  if (guardInstalled) return
  guardInstalled = true
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (offline) throw new Error('离线模式已开启，已阻止网络请求')
    return originalFetch(input, init)
  }
}
