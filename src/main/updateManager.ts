import { app } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import type { CoreUpdateAsset, CoreUpdateCheck, CoreUpdateManifest } from '../shared/types'
import type { RustCoreClient } from './rustCore'
import { downloadToFile } from './downloadSource'

const DEFAULT_FEED = 'https://api.github.com/repos/11ly322/fangjie-launcher/releases'
const USER_AGENT = 'Fangjie-Updater/0.1'

interface FeedAsset {
  name?: string
  url?: string
  browser_download_url?: string
  size?: number
  digest?: string
  sha256?: string
}

interface FeedRelease {
  tag_name?: string
  name?: string
  body?: string
  notes?: string
  published_at?: string
  prerelease?: boolean
  version?: string
  channel?: 'stable' | 'beta'
  assets?: FeedAsset[] | CoreUpdateAsset[]
}

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, '')
}

function shaFromAsset(asset: FeedAsset): string {
  if (typeof asset.sha256 === 'string') return asset.sha256.toLowerCase()
  if (typeof asset.digest === 'string') {
    return asset.digest.replace(/^sha256:/i, '').toLowerCase()
  }
  return ''
}

function normalizeAsset(asset: FeedAsset, index: number): CoreUpdateAsset | null {
  const url = asset.browser_download_url || asset.url
  if (!url) return null
  return {
    platform: 'win32-x64',
    url,
    sha256: shaFromAsset(asset),
    size: Number(asset.size) || 0,
    signature: undefined
  }
}

function normalizeRelease(raw: FeedRelease): CoreUpdateManifest | null {
  const version = normalizeVersion(String(raw.version || raw.tag_name || ''))
  if (!/^\d+\.\d+\.\d+/.test(version)) return null
  const assets = (raw.assets || [])
    .map((asset, index) => normalizeAsset(asset, index))
    .filter((asset): asset is CoreUpdateAsset => Boolean(asset))
  const installer =
    assets.find((asset) => /setup.*\.exe$/i.test(asset.url)) ||
    assets.find((asset) => /\.exe$/i.test(asset.url)) ||
    assets.find((asset) => /portable.*\.zip$/i.test(asset.url)) ||
    assets[0]
  if (!installer) return null
  return {
    version,
    channel: raw.channel === 'stable' ? 'stable' : raw.prerelease || version.includes('-') ? 'beta' : 'stable',
    notes: String(raw.notes || raw.body || '').slice(0, 8000),
    published_at: raw.published_at || new Date().toISOString(),
    assets: [installer]
  }
}

async function fetchFeed(): Promise<FeedRelease[]> {
  const url = process.env.FJ_UPDATE_FEED || DEFAULT_FEED
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': USER_AGENT
    }
  })
  if (!response.ok) throw new Error(`更新源返回 HTTP ${response.status}`)
  const data = (await response.json()) as FeedRelease[] | FeedRelease
  if (Array.isArray(data)) return data
  return [data]
}

export async function checkForUpdates(rustCore: RustCoreClient): Promise<CoreUpdateCheck> {
  const releases = await fetchFeed()
  const manifest = releases
    .map(normalizeRelease)
    .find((candidate): candidate is CoreUpdateManifest => Boolean(candidate))
  if (!manifest) throw new Error('更新源没有可用的 Windows 资产')
  return rustCore.request<CoreUpdateCheck>('check_update', {
    current_version: app.getVersion(),
    manifest
  })
}

export async function downloadUpdate(
  rustCore: RustCoreClient,
  asset: CoreUpdateAsset
): Promise<string> {
  if (!asset.url) throw new Error('更新资产缺少下载地址')
  if (!asset.sha256) throw new Error('发布资产缺少 SHA256，拒绝下载安装包')
  const directory = join(app.getPath('userData'), 'updates')
  mkdirSync(directory, { recursive: true })
  let filename = 'Fangjie-update.exe'
  try {
    filename = decodeURIComponent(new URL(asset.url).pathname.split('/').pop() || filename)
  } catch {
    /* keep fallback */
  }
  const destination = join(directory, filename.replace(/[^A-Za-z0-9._-]/g, '_'))
  await downloadToFile({
    url: asset.url,
    destination,
    expectedSha256: asset.sha256,
    expectedSize: asset.size > 0 ? asset.size : undefined,
    headers: { 'User-Agent': USER_AGENT }
  })
  await rustCore.request('verify_update', {
    path: destination,
    asset
  })
  return destination
}

export async function applyUpdate(installerPath: string): Promise<void> {
  if (!existsSync(installerPath)) throw new Error('更新包不存在')
  if (process.platform !== 'win32' || !/\.exe$/i.test(installerPath)) {
    throw new Error('自动替换目前只支持 Windows 安装版 .exe；便携版请手动替换')
  }
  const child = spawn(installerPath, ['/S'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  })
  child.unref()
  setTimeout(() => app.quit(), 500)
}
