import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { configureMetadataCache, fetchCachedJson, readMetadataCache } from './metadataCache'
import { setOffline } from './networkPolicy'

const roots: string[] = []

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'fangjie-metadata-'))
  roots.push(root)
  configureMetadataCache(root)
  return root
}

afterEach(() => {
  setOffline(false)
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('metadata disk cache', () => {
  it('serves fresh entries without a second request and revalidates with ETag', async () => {
    tempRoot()
    let requests = 0
    let etagSeen = ''
    const server = createServer((request, response) => {
      requests += 1
      etagSeen = String(request.headers['if-none-match'] || '')
      if (etagSeen === '"v1"') {
        response.writeHead(304, { ETag: '"v1"' })
        response.end()
        return
      }
      response.writeHead(200, { 'content-type': 'application/json', ETag: '"v1"' })
      response.end(JSON.stringify({ project_id: 'iris', title: 'Iris' }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('server did not bind')
    const url = `http://127.0.0.1:${address.port}/project/iris`
    try {
      const first = await fetchCachedJson<{ project_id: string; title: string }>({
        key: 'test:project:iris',
        url,
        ttlMs: 60_000,
        label: '测试'
      })
      expect(first.fromCache).toBe(false)
      expect(first.data.title).toBe('Iris')
      expect(requests).toBe(1)

      const second = await fetchCachedJson<{ project_id: string; title: string }>({
        key: 'test:project:iris',
        url,
        ttlMs: 60_000,
        label: '测试'
      })
      expect(second.fromCache).toBe(true)
      expect(second.notModified).toBe(false)
      expect(requests).toBe(1)

      await new Promise((resolve) => setTimeout(resolve, 5))
      const revalidated = await fetchCachedJson<{ project_id: string; title: string }>({
        key: 'test:project:iris',
        url,
        ttlMs: 1,
        label: '测试'
      })
      expect(revalidated.fromCache).toBe(true)
      expect(revalidated.notModified).toBe(true)
      expect(etagSeen).toBe('"v1"')
      expect(requests).toBe(2)
      expect(readMetadataCache<{ title: string }>('test:project:iris')?.data.title).toBe('Iris')
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
    }
  })

  it('uses an expired disk entry in offline mode without any request', async () => {
    tempRoot()
    let requests = 0
    const server = createServer((_request, response) => {
      requests += 1
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ ok: true }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('server did not bind')
    const url = `http://127.0.0.1:${address.port}/offline`
    try {
      await fetchCachedJson<{ ok: boolean }>({
        key: 'test:offline',
        url,
        ttlMs: 0,
        label: '测试'
      })
      expect(requests).toBe(1)
      setOffline(true)
      await new Promise((resolve) => setTimeout(resolve, 5))
      const cached = await fetchCachedJson<{ ok: boolean }>({
        key: 'test:offline',
        url,
        ttlMs: 0,
        label: '测试'
      })
      expect(cached.data.ok).toBe(true)
      expect(cached.fromCache).toBe(true)
      expect(requests).toBe(1)
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
      setOffline(false)
    }
  })
})
