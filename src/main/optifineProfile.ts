import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface OptiFineProfile {
  id: string
  modified: number
}

/**
 * Pure profile discovery for the OptiFine guided installer. The installer is
 * GUI-driven, but the post-install binding is deterministic and testable.
 */
export function findOptiFineProfiles(versionsDir: string, minecraftVersion: string): OptiFineProfile[] {
  if (!existsSync(versionsDir)) return []
  const profiles: OptiFineProfile[] = []
  for (const entry of readdirSync(versionsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const jsonPath = join(versionsDir, entry.name, entry.name + '.json')
    if (!existsSync(jsonPath)) continue
    try {
      const raw = JSON.parse(readFileSync(jsonPath, 'utf8')) as { id?: string }
      const id = String(raw.id || entry.name)
      if (!/optifine/i.test(id) || !id.includes(minecraftVersion)) continue
      profiles.push({ id, modified: statSync(jsonPath).mtimeMs })
    } catch {
      /* ignore invalid profile json */
    }
  }
  return profiles.sort((left, right) => right.modified - left.modified)
}

export function latestOptiFineProfile(
  versionsDir: string,
  minecraftVersion: string
): string | null {
  return findOptiFineProfiles(versionsDir, minecraftVersion)[0]?.id || null
}
