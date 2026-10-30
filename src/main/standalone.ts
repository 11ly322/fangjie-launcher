import { existsSync, mkdirSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type {
  ModSource,
  StandaloneLoaderInstallRequest,
  StandaloneLoaderInstallResult,
  StandaloneModDownloadRequest,
  StandaloneModDownloadResult
} from '../shared/types'
import type { LauncherStore } from './store'
import { safeFileName } from './store'
import type { TaskManager } from './tasks'
import { getModProject } from './modrinth'
import { getCurseForgeProject } from './curseforge'
import { downloadToFile } from './downloadSource'
import { installModLoader } from './loaders'

function uniqueDestination(directory: string, fileName: string): string {
  const clean = safeFileName(fileName || 'download.jar')
  const extension = extname(clean)
  const stem = basename(clean, extension)
  let candidate = join(directory, clean)
  let index = 1
  while (existsSync(candidate)) {
    candidate = join(directory, `${stem}-${index}${extension}`)
    index += 1
  }
  return candidate
}

export async function installStandaloneLoader(
  store: LauncherStore,
  tasks: TaskManager,
  request: StandaloneLoaderInstallRequest
): Promise<StandaloneLoaderInstallResult> {
  const mcVersion = request.mcVersion?.trim()
  if (!mcVersion) throw new Error('请选择 Minecraft 版本')
  if (!request.loader) throw new Error('请选择要安装的加载器')
  const baseJson = join(store.minecraftPath, 'versions', mcVersion, `${mcVersion}.json`)
  if (!existsSync(baseJson)) {
    throw new Error(`共享目录中没有 Minecraft ${mcVersion} 原版文件，请先安装一次该版本再单独安装加载器`)
  }
  const taskId = tasks.create({
    kind: 'instance',
    title: `安装 ${request.loader} ${mcVersion}`,
    subtitle: '独立加载器下载',
    detail: '准备下载加载器文件…'
  })
  tasks.start(taskId, '准备下载加载器文件…')
  try {
    const result = await installModLoader({
      mcPath: store.minecraftPath,
      mcVersion,
      loader: request.loader,
      javaPath: store.settings.javaPath || undefined,
      onDetail: (detail, progress) => {
        tasks.update(taskId, { detail, progress: Math.max(1, Math.min(99, progress ?? 60)) })
      }
    })
    tasks.finish(taskId, `${request.loader} ${result.loaderVersion} 已安装到共享版本目录`, 100)
    return { versionId: result.versionId, loaderVersion: result.loaderVersion }
  } catch (error) {
    tasks.fail(taskId, error instanceof Error ? error.message : String(error))
    throw error
  }
}

export async function downloadStandaloneMod(
  store: LauncherStore,
  tasks: TaskManager,
  request: StandaloneModDownloadRequest
): Promise<StandaloneModDownloadResult> {
  const source: ModSource = request.source === 'curseforge' ? 'curseforge' : 'modrinth'
  const projectType = request.projectType || 'mod'
  if (!request.projectId) throw new Error('缺少项目 ID')
  const { project, versions } =
    source === 'curseforge'
      ? await getCurseForgeProject(request.projectId)
      : await getModProject(request.projectId, undefined, projectType)
  const version = request.versionId
    ? versions.find((item) => item.id === request.versionId)
    : versions[0]
  if (!version) throw new Error('没有找到可下载的版本，请刷新项目详情后重试')
  const file = version.files.find((item) => item.primary) || version.files[0]
  if (!file) throw new Error('这个版本没有可下载的文件')

  const directory = join(
    store.dataPath,
    'downloads',
    projectType === 'modpack' ? 'modpacks' : 'mods'
  )
  mkdirSync(directory, { recursive: true })
  const destination = uniqueDestination(directory, file.filename)
  const taskId = tasks.create({
    kind: 'mod',
    title: `${projectType === 'modpack' ? '下载整合包' : '仅下载'}「${project.title}」`,
    subtitle: `${file.filename} · ${source === 'curseforge' ? 'CurseForge' : 'Modrinth'}`
  })
  tasks.start(taskId, '正在下载文件…')
  try {
    await downloadToFile({
      url: file.url,
      destination,
      expectedSha1: file.hashes.sha1,
      expectedSize: file.size
    })
    tasks.finish(taskId, `已保存到 ${destination}`, 100)
    return {
      path: destination,
      fileName: basename(destination),
      versionId: version.id,
      versionName: version.version_number,
      title: project.title
    }
  } catch (error) {
    tasks.fail(taskId, error instanceof Error ? error.message : String(error))
    throw error
  }
}
