import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { LauncherStore } from './store'
import { errorMessage } from './java'
import { USER_AGENT } from './version'

const CSL_PROJECT_ID = 'idMHQ4n2'
const MODRINTH_API = 'https://api.modrinth.com/v2'
const MCIM_API = 'https://mod.mcimirror.top/modrinth/v2'

interface ModrinthVersion {
  id: string
  version_number: string
  game_versions: string[]
  loaders: string[]
  files: Array<{
    url: string
    filename: string
    primary: boolean
    size: number
    hashes?: { sha1?: string }
  }>
}

export async function applySkinToInstance(
  store: LauncherStore,
  instanceId: string
): Promise<{ instanceId: string; fileName: string }> {
  const instance = store.getInstance(instanceId)
  if (!instance) throw new Error('找不到目标实例')
  if (instance.loader === 'vanilla') {
    throw new Error('本地皮肤需要模组加载器，请选择 Fabric、Quilt、Forge 或 NeoForge 实例')
  }
  const account = store.getPublicAccount()
  if (!account.skin) throw new Error('请先选择一张本地皮肤')
  if (account.type !== 'offline') {
    throw new Error('正版账户使用 Mojang 皮肤，无需应用本地皮肤')
  }
  const skinPath = store.getSkinPath()
  if (!skinPath) throw new Error('本地皮肤文件已丢失，请重新选择')

  const gamePath = store.ensureInstanceFolders(instance)
  const modsPath = join(gamePath, 'mods')
  mkdirSync(modsPath, { recursive: true })
  for (const entry of readdirSync(modsPath)) {
    if (/^customskinloader/i.test(entry) && (entry.endsWith('.jar') || entry.endsWith('.jar.disabled'))) {
      rmSync(join(modsPath, entry), { force: true })
    }
  }

  const version = await resolveCustomSkinLoaderVersion(instance.mcVersion)
  const file = version.files.find((entry) => entry.filename.toLowerCase().endsWith('.jar'))
  if (!file) throw new Error('CustomSkinLoader 没有可下载的 jar 文件')
  const fileName = file.filename
  await downloadToFile(file.url, join(modsPath, fileName), file.hashes?.sha1)
  const jarPath = join(modsPath, fileName)
  if (!existsSync(jarPath)) throw new Error('CustomSkinLoader 下载失败')

  const cslRoot = join(gamePath, 'CustomSkinLoader')
  const skinsRoot = join(cslRoot, 'LocalSkin', 'skins')
  mkdirSync(skinsRoot, { recursive: true })
  writeFileSync(
    join(cslRoot, 'CustomSkinLoader.json'),
    JSON.stringify(
      {
        enable: true,
        loadlist: [
          { name: 'LocalSkin', type: 'Legacy', root: 'LocalSkin/' },
          { name: 'Mojang', type: 'MojangAPI' }
        ],
        loadCape: false,
        loadElytra: false,
        cacheExpiry: 0
      },
      null,
      2
    ),
    'utf8'
  )
  const skinBuffer = readFileSync(skinPath)
  writeFileSync(join(skinsRoot, `${account.name}.png`), skinBuffer)
  writeFileSync(
    join(cslRoot, 'LocalSkin', 'profile.json'),
    JSON.stringify({ name: account.name, model: account.skin.model }, null, 2),
    'utf8'
  )

  store.markSkinApplied(instanceId)
  return { instanceId, fileName }
}

async function resolveCustomSkinLoaderVersion(mcVersion: string): Promise<ModrinthVersion> {
  let versions: ModrinthVersion[]
  try {
    versions = await fetchVersions(MODRINTH_API, mcVersion)
  } catch {
    versions = await fetchVersions(MCIM_API, mcVersion)
  }
  if (!versions.length) {
    throw new Error(`CustomSkinLoader 暂无兼容 Minecraft ${mcVersion} 的版本`)
  }
  const primary = versions.find((version) => version.files.some((file) => file.primary)) || versions[0]
  return primary
}

async function fetchVersions(apiBase: string, mcVersion: string): Promise<ModrinthVersion[]> {
  const url = `${apiBase}/project/${CSL_PROJECT_ID}/version?game_versions=${encodeURIComponent(
    JSON.stringify([mcVersion])
  )}`
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000)
  })
  if (!response.ok) throw new Error(`无法获取 CustomSkinLoader 版本（HTTP ${response.status}）`)
  const data = (await response.json()) as ModrinthVersion[]
  return Array.isArray(data) ? data : []
}

async function downloadToFile(url: string, destination: string, expectedSha1?: string): Promise<void> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(90_000)
  })
  if (!response.ok || !response.body) throw new Error(`下载皮肤组件失败（HTTP ${response.status}）`)
  const buffer = Buffer.from(await response.arrayBuffer())
  if (expectedSha1) {
    const hash = createHash('sha1').update(buffer).digest('hex')
    if (hash !== expectedSha1.toLowerCase()) throw new Error('皮肤组件校验失败')
  }
  mkdirSync(dirname(destination), { recursive: true })
  const temporary = `${destination}.part`
  writeFileSync(temporary, buffer)
  rmSync(destination, { force: true })
  renameSync(temporary, destination)
}

export function skinErrorMessage(error: unknown): string {
  return errorMessage(error)
}
