import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, normalize, sep } from 'node:path'
import { open, readAllEntries, readEntry } from '@xmcl/unzip'
import type { CoreModpackReport, Instance } from '../shared/types'
import type { LauncherStore } from './store'
import { safeFileName } from './store'
import { downloadFile } from './modrinth'
import { getCurseForgeFile } from './curseforge'

interface CurseForgeManifestFile {
  projectID?: number
  fileID?: number
  required?: boolean
}

interface CurseForgeManifest {
  manifestType?: string
  name?: string
  version?: string
  minecraft?: {
    version?: string
    modLoaders?: Array<{ id?: string; primary?: boolean }>
  }
  files?: CurseForgeManifestFile[]
}

/** Import a CurseForge `.zip` modpack into an existing matching instance. */
export async function importCurseForgeZip(options: {
  store: LauncherStore
  instance: Instance
  archivePath: string
}): Promise<CoreModpackReport> {
  const { store, instance, archivePath } = options
  const zip = await open(archivePath)
  try {
    const entries = await readAllEntries(zip)
    const manifestEntry = entries.find((entry) => entry.fileName === 'manifest.json')
    if (!manifestEntry) throw new Error('整合包缺少 manifest.json')
    const manifest = JSON.parse(
      (await readEntry(zip, manifestEntry)).toString('utf8')
    ) as CurseForgeManifest
    const minecraftVersion = manifest.minecraft?.version
    if (minecraftVersion && minecraftVersion !== instance.mcVersion) {
      throw new Error(
        '整合包面向 Minecraft ' + minecraftVersion + '，当前实例是 ' + instance.mcVersion
      )
    }

    const gameDir = store.ensureInstanceFolders(instance)
    const modsDir = join(gameDir, 'mods')
    mkdirSync(modsDir, { recursive: true })
    let downloaded = 0
    let skipped = 0
    const warnings: string[] = []
    for (const item of manifest.files || []) {
      if (!item.projectID || !item.fileID) continue
      if (item.required === false) {
        skipped += 1
        continue
      }
      try {
        const file = await getCurseForgeFile(item.projectID, item.fileID)
        const destination = join(modsDir, safeFileName(file.fileName))
        if (existsSync(destination)) {
          skipped += 1
          continue
        }
        await downloadFile({
          url: file.url,
          destination,
          expectedSha1: file.sha1,
          signal: new AbortController().signal,
          onChunk: () => undefined
        })
        downloaded += 1
      } catch (error) {
        warnings.push(
          'project ' + item.projectID + '/' + item.fileID + ': ' +
          (error instanceof Error ? error.message : String(error))
        )
      }
    }

    let overrides = 0
    for (const entry of entries) {
      if (!entry.fileName.startsWith('overrides/') || entry.fileName.endsWith('/')) continue
      const relative = normalize(entry.fileName.slice('overrides/'.length))
      if (relative.startsWith('..' + sep) || relative === '..') {
        warnings.push('已跳过越界的 overrides 路径：' + entry.fileName)
        continue
      }
      const destination = join(gameDir, relative)
      if (!destination.startsWith(gameDir)) {
        warnings.push('已跳过越界的 overrides 路径：' + entry.fileName)
        continue
      }
      mkdirSync(dirname(destination), { recursive: true })
      writeFileSync(destination, await readEntry(zip, entry))
      overrides += 1
    }

    return {
      name: manifest.name || 'CurseForge 整合包',
      version: manifest.version || '1.0.0',
      downloaded,
      overrides,
      skipped,
      warnings
    }
  } finally {
    zip.close()
  }
}

