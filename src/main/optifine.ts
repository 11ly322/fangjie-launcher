import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Instance } from '../shared/types'
import type { LauncherStore } from './store'
import { scanJavaRuntimes } from './java'
import { optifineMinecraftVersion } from '../shared/optifine'
import { latestOptiFineProfile } from './optifineProfile'

export interface OptiFineInstallResult {
  versionId: string
  profileName: string
  installerPath: string
}

function createMinecraftJunction(store: LauncherStore): { root: string; link: string } {
  const root = mkdtempSync(join(tmpdir(), 'fangjie-optifine-'))
  const link = join(root, '.minecraft')
  execFileSync('cmd.exe', ['/d', '/c', 'mklink', '/J', link, store.minecraftPath], {
    windowsHide: true,
    stdio: 'ignore'
  })
  return { root, link }
}

function cleanupJunction(root: string, link: string): void {
  let removed = false
  if (existsSync(link)) {
    try {
      execFileSync('cmd.exe', ['/d', '/c', 'rmdir', link], {
        windowsHide: true,
        stdio: 'ignore'
      })
      removed = true
    } catch {
      /* never recursively delete a directory that may still be a junction */
    }
  }
  if (removed && existsSync(root)) rmSync(root, { recursive: true, force: true })
}

/**
 * Run the official OptiFine installer as a guided local installation.
 *
 * OptiFine has no stable unattended CLI. We launch the official installer,
 * redirect its `%APPDATA%\\.minecraft` lookup to a temporary junction of the
 * launcher's shared version directory, wait for the user to finish the GUI,
 * then bind the detected OptiFine profile to the instance. This is intentionally
 * not described as a fully unattended install.
 */
export async function installOptiFine(options: {
  store: LauncherStore
  instance: Instance
  installerPath: string
}): Promise<OptiFineInstallResult> {
  const { store, instance, installerPath } = options
  if (process.platform !== 'win32') throw new Error('OptiFine 本地安装目前仅支持 Windows')
  if (!/optifine.*\.jar$/i.test(installerPath)) {
    throw new Error('请选择官方 OptiFine 安装器 .jar 文件')
  }
  const minecraftVersion = optifineMinecraftVersion(installerPath.split(/[\\/]/).pop() || '')
  if (!minecraftVersion) {
    throw new Error('无法从文件名识别 OptiFine 对应的 Minecraft 版本')
  }
  if (minecraftVersion !== instance.mcVersion) {
    throw new Error(`安装器面向 Minecraft ${minecraftVersion}，当前实例是 ${instance.mcVersion}`)
  }
  const java = await resolveJavaAsync(store)
  const { root, link } = createMinecraftJunction(store)
  try {
    const child = spawn(java, ['-jar', installerPath], {
      cwd: store.instanceGamePath(instance),
      env: { ...process.env, APPDATA: root },
      windowsHide: false,
      stdio: 'ignore'
    })
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code) => resolve(code))
    })
    if (exitCode !== 0) {
      throw new Error(`OptiFine 安装器退出，代码 ${exitCode ?? 'unknown'}`)
    }
    const versionId = latestOptiFineProfile(join(store.minecraftPath, 'versions'), minecraftVersion)
    if (!versionId) {
      throw new Error('安装器结束后没有找到 OptiFine 版本配置，请确认在安装器中点击了 Install')
    }
    store.updateInstance(instance.id, (current) => ({ ...current, versionId }))
    return { versionId, profileName: versionId, installerPath }
  } finally {
    cleanupJunction(root, link)
  }
}

async function resolveJavaAsync(store: LauncherStore): Promise<string> {
  const configured = store.settings.javaPath
  if (configured && existsSync(configured)) return configured
  const status = await scanJavaRuntimes(store)
  const preferred =
    status.runtimes.find((runtime) => runtime.path === configured) ||
    status.runtimes.find((runtime) => runtime.source === 'manual') ||
    status.runtimes[0]
  if (!preferred) {
    throw new Error('没有可用的 Java。请先在设置中检测或选择 Java，再运行 OptiFine 安装器。')
  }
  return preferred.path
}
