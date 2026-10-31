import { Version } from '@xmcl/core'
import { existsSync } from 'node:fs'
import type { Instance, LoaderType } from '../shared/types'
import { errorMessage, normalizeJavaPath, requiredJavaMajor, scanJavaRuntimes } from './java'
import { installModLoader } from './loaders'
import { isGameRunning } from './minecraft'
import { isOffline } from './networkPolicy'
import type { LauncherStore } from './store'

const MODDED_LOADERS: LoaderType[] = ['fabric', 'quilt', 'forge', 'neoforge']

export function isModdedLoader(loader: unknown): loader is Exclude<LoaderType, 'vanilla'> {
  return typeof loader === 'string' && MODDED_LOADERS.includes(loader as LoaderType)
}

export async function setInstanceLoader(
  store: LauncherStore,
  instanceId: string,
  loader: LoaderType
): Promise<Instance> {
  const instance = store.getInstance(instanceId)
  if (!instance) throw new Error('找不到这个实例')
  if (!['vanilla', ...MODDED_LOADERS].includes(loader)) throw new Error('不支持的模组加载器')
  if (isGameRunning(instanceId)) throw new Error('请先结束正在运行的游戏，再更改模组加载器')
  if (instance.loader === loader) return instance
  if (loader !== 'vanilla' && isOffline()) {
    throw new Error('离线模式已开启，无法下载模组加载器；请先关闭离线模式')
  }

  let vanilla
  try {
    vanilla = await Version.parse(store.minecraftPath, instance.mcVersion)
  } catch (error) {
    throw new Error(`缺少 Minecraft ${instance.mcVersion} 基础版本文件，请先修复实例：${errorMessage(error)}`)
  }

  if (loader === 'vanilla') {
    const next = store.updateInstance(instanceId, (current) => ({
      ...current,
      loader: 'vanilla',
      loaderVersion: undefined,
      versionId: current.mcVersion
    }))
    return next
  }

  const javaPath = await resolveJavaPath(store, instance, requiredJavaMajor(vanilla), loader)
  let result
  try {
    result = await installModLoader({
      mcPath: store.minecraftPath,
      mcVersion: instance.mcVersion,
      loader,
      javaPath,
      onDetail: () => undefined
    })
  } catch (error) {
    throw new Error(`安装 ${loader} 加载器失败：${errorMessage(error)}`)
  }

  return store.updateInstance(instanceId, (current) => ({
    ...current,
    loader,
    loaderVersion: result.loaderVersion,
    versionId: result.versionId
  }))
}

async function resolveJavaPath(
  store: LauncherStore,
  instance: Instance,
  requiredMajor: number,
  loader: Exclude<LoaderType, 'vanilla'>
): Promise<string | undefined> {
  const explicit = normalizeJavaPath(instance.javaPath || '')
  if (explicit && existsSync(explicit)) return explicit

  const status = await scanJavaRuntimes(store)
  const configured = status.configuredPath
    ? status.runtimes.find((runtime) => normalizeJavaPath(runtime.path) === normalizeJavaPath(status.configuredPath || ''))
    : undefined
  const compatible =
    status.runtimes.find((runtime) => runtime.majorVersion === requiredMajor) ||
    status.runtimes.find((runtime) => runtime.majorVersion >= requiredMajor) ||
    status.runtimes[0]
  const chosen = configured || compatible

  if (!chosen && (loader === 'forge' || loader === 'neoforge')) {
    throw new Error(`没有找到可用于安装 ${loader} 的 Java 运行时，请先在设置中指定 Java`)
  }
  return chosen?.path
}
