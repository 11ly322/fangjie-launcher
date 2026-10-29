import { existsSync } from 'node:fs'
import { cp, mkdir, readdir } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { LauncherStore } from './store'

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

function samePath(a: string, b: string): boolean {
  return process.platform === 'win32'
    ? a.toLowerCase() === b.toLowerCase()
    : a === b
}

/**
 * Copy the current data directory into an empty target, then persist the
 * location pointer. The old directory is intentionally left untouched so a
 * failed migration never destroys the user's worlds or mods.
 */
export async function migrateDataLocation(
  store: LauncherStore,
  targetInput: string
): Promise<{ path: string }> {
  if (process.env.FJ_DATA) {
    throw new Error('当前通过 FJ_DATA 指定数据目录，不能从界面迁移')
  }
  if (typeof targetInput !== 'string' || !targetInput.trim()) {
    throw new Error('请选择新的数据目录')
  }
  if (!isAbsolute(targetInput)) {
    throw new Error('数据目录必须是绝对路径')
  }

  const source = resolve(store.dataPath)
  const target = resolve(targetInput)
  if (samePath(source, target)) {
    throw new Error('新目录与当前数据目录相同')
  }
  if (isInside(source, target) || isInside(target, source)) {
    throw new Error('新目录不能位于当前数据目录内部，也不能包含当前数据目录')
  }
  if (existsSync(target)) {
    const entries = await readdir(target)
    if (entries.length > 0) {
      throw new Error('请选择一个空文件夹，或先在资源管理器中新建一个文件夹')
    }
  } else {
    await mkdir(target, { recursive: true })
  }

  if (existsSync(source)) {
    for (const entry of await readdir(source)) {
      await cp(join(source, entry), join(target, entry), {
        recursive: true,
        force: false,
        errorOnExist: true,
        preserveTimestamps: true
      })
    }
  }

  const committed = store.setDataLocation(target)
  return { path: committed }
}
