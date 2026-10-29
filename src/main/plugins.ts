import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { shell } from 'electron'
import type { PluginManifest, PluginRecord } from '../shared/types'
import type { LauncherStore } from './store'
import type { RustCoreClient } from './rustCore'

export function pluginsDirectory(store: LauncherStore): string {
  return join(store.dataPath, 'plugins')
}

export async function listPlugins(
  store: LauncherStore,
  rustCore: RustCoreClient
): Promise<PluginRecord[]> {
  const root = pluginsDirectory(store)
  if (!existsSync(root)) return []
  const records: PluginRecord[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const directory = join(root, entry.name)
    const manifestPath = join(directory, 'manifest.json')
    if (!existsSync(manifestPath)) {
      records.push({ directory, valid: false, warnings: [], error: '缺少 manifest.json' })
      continue
    }
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PluginManifest
      const validation = await rustCore.request<{ warnings: string[] }>('validate_plugin', { manifest })
      records.push({ directory, manifest, valid: true, warnings: validation.warnings || [] })
    } catch (error) {
      records.push({
        directory,
        valid: false,
        warnings: [],
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
  return records.sort((a, b) => (a.manifest?.name || a.directory).localeCompare(b.manifest?.name || b.directory))
}

export async function openPluginsFolder(store: LauncherStore): Promise<void> {
  const root = pluginsDirectory(store)
  mkdirSync(root, { recursive: true })
  const error = await shell.openPath(root)
  if (error) throw new Error(error)
}
