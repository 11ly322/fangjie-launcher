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
