import { spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { app } from 'electron'
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

/**
 * Run the official OptiFine installer headlessly.
 *
 * OptiFine has no CLI, but its installer exposes `Installer.doInstall(File)`.
 * We ship a tiny Java bridge class that invokes that public method against the
 * launcher's shared .minecraft directory. We do not redistribute OptiFine.
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
  const helperDirectory = app.isPackaged
    ? join(process.resourcesPath, 'bin', 'optifine-helper')
    : join(app.getAppPath(), 'resources', 'bin', 'optifine-helper')
  const helperClass = join(helperDirectory, 'InstallOptifine.class')
  if (!existsSync(helperClass)) {
    throw new Error('OptiFine 安装桥接文件缺失，请重新安装启动器')
  }
  const profilesPath = join(store.minecraftPath, 'launcher_profiles.json')
  if (!existsSync(profilesPath)) {
    writeFileSync(profilesPath, JSON.stringify({ profiles: {}, settings: {}, version: 3 }, null, 2))
  }
  const classPath = installerPath + delimiter + helperDirectory
  const child = spawn(java, ['-Djava.awt.headless=true', '-cp', classPath, 'InstallOptifine', store.minecraftPath], {
    cwd: store.minecraftPath,
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'ignore']
  })
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('OptiFine 安装超时'))
    }, 180_000)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolve(code)
    })
  })
  if (exitCode !== 0) {
    throw new Error('OptiFine 安装器退出，代码 ' + (exitCode ?? 'unknown'))
  }
  const versionId = latestOptiFineProfile(join(store.minecraftPath, 'versions'), minecraftVersion)
  if (!versionId) {
    throw new Error('OptiFine 安装完成，但没有找到对应版本配置')
  }
  store.updateInstance(instance.id, (current) => ({ ...current, versionId }))
  return { versionId, profileName: versionId, installerPath }
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
