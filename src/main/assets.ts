import { existsSync, mkdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { Instance, ModSource, ProjectType } from '../shared/types'
import type { LauncherStore } from './store'
import { safeFileName } from './store'
import { downloadFile, getModProject } from './modrinth'
import { getCurseForgeProject } from './curseforge'

function targetDirectory(instance: Instance, kind: ProjectType): string {
  return kind === 'shader' ? 'shaderpacks' : 'resourcepacks'
}

function uniqueFileName(directory: string, name: string): string {
  const safe = safeFileName(name)
  if (!existsSync(join(directory, safe))) return safe
  const extension = extname(safe)
  const base = safe.slice(0, safe.length - extension.length)
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${base}-${index}${extension}`
    if (!existsSync(join(directory, candidate))) return candidate
  }
  throw new Error('目标目录中同名文件过多')
}

/**
 * Install a resource pack or shader. Mods use the dependency-aware mod
 * installer; these project types are single-file assets with no loader tree.
 */
export async function installAsset(options: {
  store: LauncherStore
  instanceId: string
  projectId: string
  projectType: ProjectType
  source: ModSource
}): Promise<{ fileName: string; path: string }> {
  const { store, instanceId, projectId, projectType, source } = options
  if (projectType === 'mod') throw new Error('模组必须使用模组安装流程')
  const instance = store.getInstance(instanceId)
  if (!instance) throw new Error('找不到这个实例')
  const effective = { ...instance, loader: 'vanilla' as const }
  const project =
    source === 'curseforge'
      ? await getCurseForgeProject(projectId, effective)
      : await getModProject(projectId, effective, projectType)
  const version = project.versions.find((item) => item.files.length) || project.versions[0]
  if (!version) throw new Error('这个项目没有可下载的文件')
  const file = version.files.find((item) => item.primary) || version.files[0]
  if (!file?.url) throw new Error('这个项目没有公开下载地址')

  const directory = join(store.ensureInstanceFolders(instance), targetDirectory(instance, projectType))
  mkdirSync(directory, { recursive: true })
  const fileName = uniqueFileName(directory, file.filename)
  const destination = join(directory, fileName)
  await downloadFile({
    url: file.url,
    destination,
    expectedSha1: file.hashes?.sha1,
    signal: new AbortController().signal,
    onChunk: () => undefined
  })
  return { fileName, path: destination }
}
