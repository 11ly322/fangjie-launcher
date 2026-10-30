import { app } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import type { CoreUpdateAsset, CoreUpdateCheck, CoreUpdateManifest } from '../shared/types'
import type { RustCoreClient } from './rustCore'
import { downloadToFile, requestResponse } from './downloadSource'

const DEFAULT_FEED = 'https://api.github.com/repos/11ly322/fangjie-launcher/releases'
const USER_AGENT = 'UBL-Updater/0.1'

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

function feedErrorMessage(error: unknown): string {
  const cause = (error as { cause?: { code?: string } } | null)?.cause
  const code = cause?.code
  if (
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    code === 'CERT_HAS_EXPIRED' ||
    code === 'ERR_TLS_CERT_ALTNAME_INVALID'
  ) {
    return `无法建立安全连接（${code}）；请检查系统代理、根证书，或在设置中填写可用代理。`
  }
  if (error instanceof Error && error.message === 'fetch failed') {
    return '无法连接 GitHub Releases；请检查网络、代理或防火墙。'
  }
  return error instanceof Error ? error.message : String(error)
}

async function fetchFeed(): Promise<FeedRelease[]> {
  const url = process.env.FJ_UPDATE_FEED || DEFAULT_FEED
  const response = await requestResponse(url, {
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
  let releases: FeedRelease[]
  try {
    releases = await fetchFeed()
  } catch (error) {
    throw new Error(`无法访问 GitHub Releases：${feedErrorMessage(error)}`)
  }
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
  let filename = 'UBL-update.exe'
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

const APPLY_HELPER_SOURCE = String.raw`const { spawn } = require('node:child_process')
const fs = require('node:fs')
const [parentPid, installer, installDir, appExe, logPath, relaunchArgsJson] = process.argv.slice(2)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const log = (message) => {
  try {
    fs.appendFileSync(logPath, new Date().toISOString() + ' ' + message + '\n')
  } catch {
    /* logging must never block the install */
  }
}
const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error && error.code === 'EPERM'
  }
}
async function main() {
  const pid = Number(parentPid)
  for (let i = 0; i < 160 && Number.isFinite(pid) && alive(pid); i += 1) await sleep(250)
  await sleep(1200)
  log('parent exited; running installer with /D=' + installDir)
  const installerProcess = spawn(installer, ['/S', '/D=' + installDir], {
    stdio: 'ignore',
    windowsHide: true
  })
  installerProcess.on('error', (error) => {
    log('installer failed to start: ' + error.message)
    process.exit(1)
  })
  installerProcess.on('close', async (code) => {
    log('installer exit ' + code)
    if (code !== 0) process.exit(code || 1)
    for (let i = 0; i < 40 && !fs.existsSync(appExe); i += 1) await sleep(250)
    if (!fs.existsSync(appExe)) {
      log('target executable missing: ' + appExe)
      process.exit(1)
    }
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    delete env.ELECTRON_NO_ATTACH_CONSOLE
    let relaunchArgs = []
    try {
      const parsed = JSON.parse(relaunchArgsJson || '[]')
      if (Array.isArray(parsed)) relaunchArgs = parsed.filter((item) => typeof item === 'string')
    } catch {
      /* relaunch without optional arguments */
    }
    try {
      const launched = spawn(appExe, relaunchArgs, {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        env
      })
      launched.unref()
      log('relaunched ' + appExe)
    } catch (error) {
      log('relaunch failed: ' + error.message)
      process.exit(1)
    }
    process.exit(0)
  })
}
main()
`

export async function applyUpdate(installerPath: string): Promise<void> {
  if (!existsSync(installerPath)) throw new Error('更新包不存在')
  if (process.platform !== 'win32' || !/\.exe$/i.test(installerPath)) {
    throw new Error('自动替换目前只支持 Windows 安装版 .exe；便携版请手动替换')
  }
  if (!app.isPackaged) {
    throw new Error('自动安装更新只在已安装版本中可用；开发模式请手动运行安装包')
  }
  const installDir = dirname(process.execPath)
  const appExe = join(installDir, basename(process.execPath))
  const workDir = dirname(installerPath)
  const helperPath = join(workDir, 'ubl-update-apply.cjs')
  const logPath = join(workDir, 'ubl-update-apply.log')
  writeFileSync(helperPath, APPLY_HELPER_SOURCE, 'utf8')
  try {
    writeFileSync(logPath, '', 'utf8')
  } catch {
    /* an existing log is still useful */
  }
  const helper = spawn(
    process.execPath,
    [
      helperPath,
      String(process.pid),
      installerPath,
      installDir,
      appExe,
      logPath,
      JSON.stringify(process.argv.filter((argument) => argument.startsWith('--user-data-dir=')))
    ],
    {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    }
  )
  await new Promise<void>((resolve, reject) => {
    helper.once('spawn', resolve)
    helper.once('error', (error) => reject(new Error(`无法启动更新助手：${error.message}`)))
  })
  helper.unref()
  setTimeout(() => app.quit(), 800)
}
