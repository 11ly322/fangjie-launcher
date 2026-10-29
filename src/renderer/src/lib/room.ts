export function formatRoomCode(value: string): string {
  const body = value
    .replace(/^U\//i, '')
    .replace(/[^0-9A-Za-z]/g, '')
    .toUpperCase()
    .slice(0, 16)
  if (!body) return ''
  return `U/${body.match(/.{1,4}/g)?.join('-') || body}`
}

export function isRoomCode(value: string): boolean {
  return /^U\/[A-HJ-NP-Z0-9]{4}-[A-HJ-NP-Z0-9]{4}-[A-HJ-NP-Z0-9]{4}-[A-HJ-NP-Z0-9]{4}$/.test(
    value
  )
}
