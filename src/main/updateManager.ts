import { app } from 'electron'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'
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

function cleanupLegacyUpdateDirectory(): void {
  // Older builds staged downloads under %APPDATA%\fangjie-launcher\updates.
  // 0.0.8 keeps update files beside the launcher, so this cache is obsolete.
  try {
    rmSync(join(app.getPath('userData'), 'updates'), { recursive: true, force: true })
  } catch {
    /* locked by antivirus; harmless, the next attempt will retry */
  }
}

export async function downloadUpdate(
  rustCore: RustCoreClient,
  asset: CoreUpdateAsset
): Promise<string> {
  if (!asset.url) throw new Error('更新资产缺少下载地址')
  if (!asset.sha256) throw new Error('发布资产缺少 SHA256，拒绝下载安装包')
  cleanupLegacyUpdateDirectory()
  // Installed builds keep the update package beside the launcher, never under
  // %APPDATA%. This avoids leaving temporary files on C: outside the install
  // directory and makes the whole update transaction visible in one folder.
  const directory = app.isPackaged
    ? join(dirname(process.execPath), 'updates')
    : join(app.getPath('userData'), 'updates')
  try {
    mkdirSync(directory, { recursive: true })
    const probe = join(directory, '.write-test')
    writeFileSync(probe, '')
    rmSync(probe, { force: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`安装目录不可写，无法安全更新：${message}`)
  }
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

const APPLY_HELPER_SOURCE = String.raw`$ErrorActionPreference = 'Continue'

function Write-Log([string]$message) {
  try {
    $stamp = [DateTime]::UtcNow.ToString('o')
    Add-Content -LiteralPath $LogPath -Value ($stamp + ' ' + $message) -Encoding UTF8
  } catch {
  }
}

try {
  Write-Log ('helper started parent=' + $ParentPid + ' installer=' + $Installer)
  Write-Log ('relaunch args=' + $RelaunchArgsJson)
  $parent = Get-Process -Id $ParentPid -ErrorAction SilentlyContinue
  if ($null -ne $parent) {
    try { $parent.WaitForExit(45000) | Out-Null } catch { }
  }

  $deadline = [DateTime]::UtcNow.AddSeconds(25)
  while ([DateTime]::UtcNow -lt $deadline) {
    $running = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
      try { $_.Path -eq $AppExe } catch { $false }
    })
    if ($running.Count -eq 0) { break }
    Start-Sleep -Milliseconds 350
  }
  $running = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
    try { $_.Path -eq $AppExe } catch { $false }
  })
  if ($running.Count -gt 0) {
    Write-Log ('stopping ' + $running.Count + ' lingering launcher process(es)')
    $running | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 1200
  }

  $before = 0
  if (Test-Path -LiteralPath $AppExe) {
    $before = (Get-Item -LiteralPath $AppExe).LastWriteTimeUtc.Ticks
  }

  $installed = $false
  for ($attempt = 1; $attempt -le 2; $attempt += 1) {
    Write-Log ('running installer attempt ' + $attempt + ' with /D=' + $InstallDir)
    try {
      $process = Start-Process -FilePath $Installer -ArgumentList @('/S', ('/D=' + $InstallDir)) -Wait -PassThru -WindowStyle Hidden
      Write-Log ('installer exit ' + $process.ExitCode)
      if ($process.ExitCode -ne 0) { exit $process.ExitCode }
    } catch {
      Write-Log ('installer failed: ' + $_.Exception.Message)
      exit 1
    }
    Start-Sleep -Milliseconds 1400
    if (-not (Test-Path -LiteralPath $AppExe)) {
      Write-Log ('target executable missing: ' + $AppExe)
      exit 1
    }
    $after = (Get-Item -LiteralPath $AppExe).LastWriteTimeUtc.Ticks
    if ($after -ne $before) {
      $installed = $true
      break
    }
    Write-Log 'target executable unchanged after installer; retrying'
    Start-Sleep -Milliseconds 1800
  }

  if (-not $installed) {
    Write-Log 'installer reported success but target executable was not replaced'
    exit 1
  }

  $launch = @()
  try {
    $parsed = ConvertFrom-Json -InputObject $RelaunchArgsJson
    if ($null -ne $parsed) {
      foreach ($item in @($parsed)) {
        if ($item -is [string] -and $item.Length -gt 0) {
          if ($item -match '\s') { $launch += ('"' + $item + '"') } else { $launch += $item }
        }
      }
    }
  } catch {
  }

  try {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $AppExe
    $psi.WorkingDirectory = $InstallDir
    $psi.UseShellExecute = $false
    $psi.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE') | Out-Null
    $psi.EnvironmentVariables.Remove('ELECTRON_NO_ATTACH_CONSOLE') | Out-Null
    if ($launch.Count -gt 0) { $psi.Arguments = ($launch -join ' ') }
    [System.Diagnostics.Process]::Start($psi) | Out-Null
    Write-Log ('relaunched ' + $AppExe + ' args=' + ($launch -join ' '))
  } catch {
    Write-Log ('relaunch failed: ' + $_.Exception.Message)
    exit 1
  }
  exit 0
} catch {
  Write-Log ('update helper failed: ' + $_.Exception.Message)
  exit 1
}
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
  const helperPath = join(workDir, 'ubl-update-apply.ps1')
  const logPath = join(workDir, 'ubl-update-apply.log')
  // helperSource is built below and written immediately before spawning
  try {
    writeFileSync(logPath, '', 'utf8')
  } catch {
    /* an existing log is still useful */
  }
  const powershell = process.env.SystemRoot
    ? join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe'
  const quotePowerShell = (value: string): string =>
    "'" + value.replace(/\\\\/g, '\\').replace(/'/g, "''") + "'"
  const relaunchArgs = process.argv
    .filter((argument) => argument.startsWith('--user-data-dir='))
    .map((argument) => argument.replace(/\\/g, '/'))
  const helperSource = [
    '$ParentPid = ' + String(process.pid),
    '$Installer = ' + quotePowerShell(installerPath),
    '$InstallDir = ' + quotePowerShell(installDir),
    '$AppExe = ' + quotePowerShell(appExe),
    '$LogPath = ' + quotePowerShell(logPath),
    '$RelaunchArgsJson = ' + quotePowerShell(JSON.stringify(relaunchArgs)),
    APPLY_HELPER_SOURCE
  ].join('\n')
  writeFileSync(helperPath, helperSource, 'utf8')
  const helperCommand = `"${powershell}" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${helperPath}"`
  const psQuote = (value: string): string => "'" + value.replace(/'/g, "''") + "'"
  const wmiCommand = [
    '$result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = ' + psQuote(helperCommand) + ' }',
    'if ($result.ReturnValue -ne 0) { exit 1 }',
    'Write-Output $result.ProcessId'
  ].join('; ')
  execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', wmiCommand], {
    windowsHide: true,
    timeout: 15000
  })
  setTimeout(() => app.quit(), 350)
}
