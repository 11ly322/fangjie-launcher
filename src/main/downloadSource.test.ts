import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { downloadToFile, fetchJson } from './downloadSource'
import { setOffline } from './networkPolicy'

const servers: Array<ReturnType<typeof createServer>> = []

afterEach(() => {
  setOffline(false)
  while (servers.length) servers.pop()?.close()
})

function serve(payload: Buffer): Promise<string> {
  return new Promise((resolve) => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/octet-stream' })
      response.end(payload)
    })
    servers.push(server)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve(`http://127.0.0.1:${port}/file`)
    })
  })
}

describe('unified download source', () => {
  it('downloads, verifies and replaces the destination', async () => {
    const payload = Buffer.from('fangjie-download')
    const url = await serve(payload)
    const directory = mkdtempSync(join(tmpdir(), 'fangjie-download-'))
    const destination = join(directory, 'artifact.bin')
    await downloadToFile({
      url,
      destination,
      expectedSize: payload.length,
      expectedSha1: 'b0d0d6c4c4e0a7f2e6aa0b3c1f0e7ad2f2d3c9a1'
    }).catch(() => undefined)
    // The deliberately wrong SHA1 must leave no final file.
    expect(() => readFileSync(destination)).toThrow()
    await downloadToFile({ url, destination, expectedSize: payload.length })
    expect(readFileSync(destination).toString()).toBe('fangjie-download')
    rmSync(directory, { recursive: true, force: true })
  })

  it('atomically replaces an existing destination without leaving staging files', async () => {
    const payload = Buffer.from('replacement')
    const url = await serve(payload)
    const directory = mkdtempSync(join(tmpdir(), 'fangjie-download-replace-'))
    const destination = join(directory, 'artifact.bin')
    writeFileSync(destination, 'old')

    await downloadToFile({ url, destination, expectedSize: payload.length })

    expect(readFileSync(destination).toString()).toBe('replacement')
    expect(readdirSync(directory).filter((name) => name.includes('.part-') || name.includes('.replace-'))).toEqual([])
    rmSync(directory, { recursive: true, force: true })
  })

  it('returns parsed JSON', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ ok: true }))
    })
    servers.push(server)
    const url = await new Promise<string>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        const port = typeof address === 'object' && address ? address.port : 0
        resolve(`http://127.0.0.1:${port}/data`)
      })
    })
    await expect(fetchJson<{ ok: boolean }>({ url })).resolves.toEqual({ ok: true })
  })

  it('blocks downloads in offline mode', async () => {
    setOffline(true)
    await expect(
      downloadToFile({ url: 'http://127.0.0.1:1/nope', destination: join(tmpdir(), 'nope') })
    ).rejects.toThrow('离线模式已开启')
  })
})
