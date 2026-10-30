import { app, safeStorage } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import type { Account, Instance, Settings, ThemeId } from '../shared/types'

export interface StoredSkin {
  fileName: string
  model: 'classic' | 'slim'
  appliedInstanceIds: string[]
}

export interface StoredAccount {
  name: string
  uuid: string
  type: 'offline' | 'microsoft'
  skin?: StoredSkin
}

export interface StoredMicrosoftAuth {
  accessTokenEnc: string
  refreshTokenEnc: string
  expiresAt: number
  xuid?: string
}

interface PersistedConfig {
  schemaVersion: 1
  settings: Settings
  account: StoredAccount
  instances: Instance[]
  microsoftAuth?: StoredMicrosoftAuth
}

const ACCENTS = ['#b8e85c', '#f2b860', '#8ecae6', '#f08a8a', '#b8a1f5', '#6fd6b0', '#e7d36c']

export function offlineUuid(name: string): string {
  const hash = createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest()
  hash[6] = (hash[6] & 0x0f) | 0x30
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function accentFor(seed: string): string {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0
  }
  return ACCENTS[Math.abs(hash) % ACCENTS.length]
}

export function defaultMemoryMb(): number {
  return 4096
}

export function normalizeTheme(value: unknown): ThemeId {
  return value === 'ocean' || value === 'ember' ? value : 'moss'
}

function createDefaultAccount(): StoredAccount {
  return {
    name: 'Steve',
    uuid: offlineUuid('Steve'),
    type: 'offline'
  }
}

export class LauncherStore {
  readonly homePath: string
  readonly configPath: string
  readonly dataPath: string
  readonly dataLocationPath: string
  readonly minecraftPath: string
  readonly instancesPath: string
  readonly skinsPath: string
  config: PersistedConfig

  constructor() {
    this.homePath = process.env.FJ_HOME ? resolve(process.env.FJ_HOME) : app.getPath('userData')
    this.configPath = join(this.homePath, 'config.json')
    this.dataLocationPath = join(this.homePath, 'data-location.json')
    this.dataPath = this.resolveDataPath()
    this.minecraftPath = join(this.dataPath, 'minecraft')
    this.instancesPath = join(this.dataPath, 'instances')
    this.skinsPath = join(this.homePath, 'skins')

    mkdirSync(this.minecraftPath, { recursive: true })
    mkdirSync(this.instancesPath, { recursive: true })
    mkdirSync(this.skinsPath, { recursive: true })

    this.config = this.load()
  }

  private load(): PersistedConfig {
    const fallback: PersistedConfig = {
      schemaVersion: 1,
      settings: {
        memoryMb: defaultMemoryMb(),
        theme: 'moss',
        colorMode: 'dark',
        javaPath: '',
        showSnapshots: false,
        minimizeOnLaunch: false,
        autoSnapshotBeforeLaunch: false,
        downloadConcurrency: 16,
        offline: false,
        proxyUrl: '',
        modrinthBase: 'https://api.modrinth.com/v2',
        curseforgeBase: 'https://mod.mcimirror.top/curseforge/v1'
      },
      account: createDefaultAccount(),
      instances: []
    }

    if (!existsSync(this.configPath)) {
      this.write(fallback)
      return fallback
    }

    try {
      const raw = JSON.parse(readFileSync(this.configPath, 'utf8')) as Partial<PersistedConfig>
      if (!raw || typeof raw !== 'object') return fallback
      const instances = Array.isArray(raw.instances) ? raw.instances.filter(isInstanceLike) : []
      const settings = { ...fallback.settings, ...(raw.settings || {}) }
      const rawAccount = raw.account as Partial<StoredAccount> | undefined
      const accountName =
        rawAccount && typeof rawAccount.name === 'string' ? rawAccount.name.slice(0, 16) : 'Steve'
      const accountType = rawAccount?.type === 'microsoft' ? 'microsoft' : 'offline'
      const skin =
        rawAccount?.skin &&
        typeof rawAccount.skin.fileName === 'string' &&
        (rawAccount.skin.model === 'classic' || rawAccount.skin.model === 'slim')
          ? {
              fileName: basename(rawAccount.skin.fileName),
              model: rawAccount.skin.model,
              appliedInstanceIds: Array.isArray(rawAccount.skin.appliedInstanceIds)
                ? rawAccount.skin.appliedInstanceIds.filter((id): id is string => typeof id === 'string')
                : []
            }
          : undefined
      const merged: PersistedConfig = {
        schemaVersion: 1,
        settings: {
          ...settings,
          memoryMb: clampMemory(Number(settings.memoryMb)),
          theme: normalizeTheme(settings.theme),
          colorMode: settings.colorMode === 'light' ? 'light' : 'dark',
          offline: settings.offline === true,
          proxyUrl: typeof settings.proxyUrl === 'string' ? settings.proxyUrl : '',
          modrinthBase: typeof settings.modrinthBase === 'string' ? settings.modrinthBase : 'https://api.modrinth.com/v2',
          curseforgeBase: typeof settings.curseforgeBase === 'string' ? settings.curseforgeBase : 'https://mod.mcimirror.top/curseforge/v1',
          downloadConcurrency: Math.min(64, Math.max(4, Number(settings.downloadConcurrency) || 16))
        },
        account: {
          name: accountName || 'Steve',
          uuid: accountType === 'microsoft' && rawAccount?.uuid ? rawAccount.uuid : (rawAccount?.uuid || offlineUuid(accountName || 'Steve')),
          type: accountType,
          skin
        },
        instances,
        microsoftAuth:
          raw.microsoftAuth && typeof raw.microsoftAuth.refreshTokenEnc === 'string'
            ? raw.microsoftAuth
            : undefined
      }
      return merged
    } catch {
      const backup = `${this.configPath}.broken-${Date.now()}`
      try {
        renameSync(this.configPath, backup)
      } catch {
        /* ignore backup errors */
      }
      this.write(fallback)
      return fallback
    }
  }

  private write(config: PersistedConfig): void {
    mkdirSync(dirname(this.configPath), { recursive: true })
    const temporary = `${this.configPath}.${process.pid}.tmp`
    writeFileSync(temporary, JSON.stringify(config, null, 2), 'utf8')
    renameSync(temporary, this.configPath)
  }

  private resolveDataPath(): string {
    if (process.env.FJ_DATA) return resolve(process.env.FJ_DATA)
    try {
      const pointer = JSON.parse(readFileSync(this.dataLocationPath, 'utf8')) as { dataPath?: unknown }
      if (typeof pointer.dataPath === 'string' && isAbsolute(pointer.dataPath)) {
        return resolve(pointer.dataPath)
      }
    } catch {
      /* no custom location yet, or an unreadable pointer; use the default */
    }
    return join(this.homePath, 'game')
  }

  /** Write the location pointer consumed on the next launch. */
  setDataLocation(targetPath: string): string {
    if (process.env.FJ_DATA) {
      throw new Error('当前通过 FJ_DATA 指定数据目录，不能从界面更改')
    }
    if (typeof targetPath !== 'string' || !targetPath.trim()) throw new Error('请选择数据目录')
    const target = resolve(targetPath)
    if (!isAbsolute(target)) throw new Error('数据目录必须是绝对路径')
    if (target === this.dataPath) return target
    mkdirSync(target, { recursive: true })
    const temporary = `${this.dataLocationPath}.${process.pid}.tmp`
    writeFileSync(
      temporary,
      JSON.stringify({ schemaVersion: 1, dataPath: target }, null, 2),
      'utf8'
    )
    renameSync(temporary, this.dataLocationPath)
    return target
  }

  save(): void {
    this.config.settings.memoryMb = clampMemory(this.config.settings.memoryMb)
    this.write(this.config)
  }

  get settings(): Settings {
    return this.config.settings
  }

  setSettings(patch: Partial<Settings>): Settings {
    const next: Settings = {
      ...this.config.settings,
      ...patch
    }
    next.memoryMb = clampMemory(Number(next.memoryMb))
    next.theme = normalizeTheme(next.theme)
    next.colorMode = next.colorMode === 'light' ? 'light' : 'dark'
    next.downloadConcurrency = Math.min(64, Math.max(4, Number(next.downloadConcurrency) || 16))
    next.javaPath = typeof next.javaPath === 'string' ? next.javaPath : ''
    this.config.settings = next
    this.save()
    return next
  }

  setAccountName(name: string): Account {
    const cleaned = name.replace(/[\r\n\t]/g, ' ').trim().slice(0, 16) || 'Steve'
    this.config.account = {
      ...this.config.account,
      name: cleaned,
      uuid: offlineUuid(cleaned),
      type: 'offline'
    }
    this.config.microsoftAuth = undefined
    this.save()
    return this.getPublicAccount()
  }

  get instances(): Instance[] {
    return this.config.instances
  }

  getInstance(id: string): Instance | undefined {
    return this.config.instances.find((instance) => instance.id === id)
  }

  addInstance(instance: Instance): Instance {
    this.config.instances.unshift(instance)
    this.save()
    return instance
  }

  updateInstance(id: string, update: (instance: Instance) => Instance): Instance {
    const index = this.config.instances.findIndex((instance) => instance.id === id)
    if (index < 0) throw new Error('找不到这个实例')
    const next = update(this.config.instances[index])
    this.config.instances[index] = next
    this.save()
    return next
  }

  removeInstance(id: string): Instance {
    const index = this.config.instances.findIndex((instance) => instance.id === id)
    if (index < 0) throw new Error('找不到这个实例')
    const [removed] = this.config.instances.splice(index, 1)
    this.save()
    return removed
  }

  instanceGamePath(instance: Instance): string {
    return join(this.instancesPath, instance.id, '.minecraft')
  }

  createInstanceId(): string {
    return randomUUID().replace(/-/g, '').slice(0, 12)
  }

  createInstanceRecord(input: {
    name: string
    mcVersion: string
    loader: Instance['loader']
    loaderVersion?: string
    versionId: string
    accent: string
    icon: string
    memoryMb: number
  }): Instance {
    const now = Date.now()
    return {
      id: this.createInstanceId(),
      name: input.name,
      mcVersion: input.mcVersion,
      loader: input.loader,
      loaderVersion: input.loaderVersion,
      versionId: input.versionId,
      accent: input.accent,
      icon: input.icon,
      memoryMb: input.memoryMb,
      jvmArgs: [],
      width: 1280,
      height: 720,
      createdAt: now,
      totalPlayTimeMs: 0,
      mods: []
    }
  }

  ensureInstanceFolders(instance: Instance): string {
    const gamePath = this.instanceGamePath(instance)
    for (const folder of ['mods', 'saves', 'logs', 'config', 'resourcepacks', 'shaderpacks']) {
      mkdirSync(join(gamePath, folder), { recursive: true })
    }
    return gamePath
  }

  getPublicAccount(): Account {
    const stored = this.config.account
    let skin: Account['skin']
    if (stored.skin) {
      const skinPath = join(this.skinsPath, stored.skin.fileName)
      try {
        const data = readFileSync(skinPath)
        skin = {
          dataUrl: `data:image/png;base64,${data.toString('base64')}`,
          fileName: stored.skin.fileName,
          model: stored.skin.model,
          appliedInstanceIds: stored.skin.appliedInstanceIds
        }
      } catch {
        skin = undefined
      }
    }
    return {
      name: stored.name,
      uuid: stored.uuid,
      type: stored.type,
      skin
    }
  }

  setMicrosoftAccount(profile: { name: string; id: string }, auth: {
    accessToken: string
    refreshToken: string
    expiresAt: number
    xuid?: string
  }): Account {
    this.config.account = {
      name: profile.name,
      uuid: formatUuid(profile.id),
      type: 'microsoft',
      skin: this.config.account.skin
    }
    this.config.microsoftAuth = {
      accessTokenEnc: encryptSecret(auth.accessToken),
      refreshTokenEnc: encryptSecret(auth.refreshToken),
      expiresAt: auth.expiresAt,
      xuid: auth.xuid
    }
    this.save()
    return this.getPublicAccount()
  }

  updateMicrosoftTokens(auth: {
    accessToken: string
    refreshToken?: string
    expiresAt: number
    xuid?: string
  }): void {
    if (!this.config.microsoftAuth) return
    this.config.microsoftAuth = {
      accessTokenEnc: encryptSecret(auth.accessToken),
      refreshTokenEnc: auth.refreshToken
        ? encryptSecret(auth.refreshToken)
        : this.config.microsoftAuth.refreshTokenEnc,
      expiresAt: auth.expiresAt,
      xuid: auth.xuid || this.config.microsoftAuth.xuid
    }
    this.save()
  }

  getMicrosoftAuth(): {
    accessToken: string
    refreshToken: string
    expiresAt: number
    xuid?: string
  } | undefined {
    const auth = this.config.microsoftAuth
    if (!auth) return undefined
    try {
      return {
        accessToken: decryptSecret(auth.accessTokenEnc),
        refreshToken: decryptSecret(auth.refreshTokenEnc),
        expiresAt: auth.expiresAt,
        xuid: auth.xuid
      }
    } catch {
      return undefined
    }
  }

  clearMicrosoftAuth(): void {
    this.config.microsoftAuth = undefined
    this.config.account = {
      ...createDefaultAccount(),
      skin: this.config.account.skin
    }
    this.save()
  }

  setSkin(input: { fileName: string; model: 'classic' | 'slim' }): void {
    this.config.account.skin = {
      fileName: basename(input.fileName),
      model: input.model,
      appliedInstanceIds: this.config.account.skin?.appliedInstanceIds || []
    }
    this.save()
  }

  markSkinApplied(instanceId: string): void {
    const skin = this.config.account.skin
    if (!skin) return
    skin.appliedInstanceIds = [...new Set([...skin.appliedInstanceIds, instanceId])]
    this.save()
  }

  getSkinPath(): string | undefined {
    const skin = this.config.account.skin
    if (!skin) return undefined
    const path = join(this.skinsPath, skin.fileName)
    return existsSync(path) ? path : undefined
  }
}

function encryptSecret(value: string): string {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return `safe:${safeStorage.encryptString(value).toString('base64')}`
    }
  } catch {
    /* fall through to encoded local storage */
  }
  return `plain:${Buffer.from(value, 'utf8').toString('base64')}`
}

function decryptSecret(value: string): string {
  if (value.startsWith('safe:')) {
    return safeStorage.decryptString(Buffer.from(value.slice(5), 'base64'))
  }
  if (value.startsWith('plain:')) {
    return Buffer.from(value.slice(6), 'base64').toString('utf8')
  }
  return value
}

function clampMemory(value: number): number {
  if (!Number.isFinite(value)) return 4096
  return Math.min(32768, Math.max(1024, Math.round(value / 256) * 256))
}

function formatUuid(value: string): string {
  const cleaned = value.replace(/-/g, '')
  if (cleaned.length !== 32) return value
  return `${cleaned.slice(0, 8)}-${cleaned.slice(8, 12)}-${cleaned.slice(12, 16)}-${cleaned.slice(16, 20)}-${cleaned.slice(20)}`
}

function isInstanceLike(value: unknown): value is Instance {
  if (!value || typeof value !== 'object') return false
  const instance = value as Partial<Instance>
  return (
    typeof instance.id === 'string' &&
    typeof instance.name === 'string' &&
    typeof instance.mcVersion === 'string' &&
    typeof instance.versionId === 'string' &&
    ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'].includes(String(instance.loader))
  )
}

export function safeFileName(name: string): string {
  const base = basename(name.replace(/\\/g, '/')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
  return base || 'file'
}
