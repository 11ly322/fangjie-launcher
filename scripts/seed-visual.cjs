const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const home = process.env.FJ_VISUAL_HOME
  ? path.resolve(process.env.FJ_VISUAL_HOME)
  : path.join(root, 'test-artifacts', 'visual-home')
const data = path.join(home, 'game')
const marker = path.join(home, '.fangjie-visual-seed')
if (fs.existsSync(home) && !fs.existsSync(marker)) {
  throw new Error(`拒绝清空未标记的目录：${home}`)
}
fs.rmSync(home, { recursive: true, force: true })
fs.mkdirSync(home, { recursive: true })
fs.mkdirSync(data, { recursive: true })
fs.writeFileSync(marker, new Date().toISOString())

const now = Date.now()
const uuid = (seed) => {
  const hex = Buffer.from(`${seed}`.repeat(16)).toString('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

const icon = (seed) => `https://cdn.modrinth.com/data/${seed}/icon.png`
const mod = (projectId, slug, title, versionName, fileName, iconUrl, enabled = true) => ({
  projectId,
  slug,
  title,
  versionId: `${slug}-${versionName}`,
  versionName,
  fileName,
  iconUrl,
  enabled,
  installedAt: now - 86400000 * 4
})

const instances = [
  {
    id: 'weekendsurvival',
    name: '周末生存',
    mcVersion: '1.21.4',
    loader: 'fabric',
    loaderVersion: '0.16.9',
    versionId: 'fabric-loader-0.16.9-1.21.4',
    icon: 'trees',
    accent: '#b8e85c',
    memoryMb: 6144,
    createdAt: now - 86400000 * 32,
    lastPlayedAt: now - 3600000 * 2,
    totalPlayTimeMs: 1000 * 60 * 60 * 14 + 1000 * 60 * 23,
    mods: [
      mod('AANobbMI', 'sodium', 'Sodium', '0.6.9+mc1.21.4', 'sodium-fabric-0.6.9+mc1.21.4.jar', 'https://cdn.modrinth.com/data/AANobbMI/295862f4724dc3f78df3447ad6072b2dcd3ef0c9_96.webp'),
      mod('YL57xq9U', 'iris', 'Iris Shaders', '1.8.1+1.21.4', 'iris-1.8.1+mc1.21.4.jar', 'https://cdn.modrinth.com/data/YL57xq9U/18d0e7f076d3d6ed5bedd472b853909aac5da202_96.webp'),
      mod('gvQqBUqZ', 'lithium', 'Lithium', '0.14.2+mc1.21.4', 'lithium-fabric-0.14.2+mc1.21.4.jar', 'https://cdn.modrinth.com/data/gvQqBUqZ/bcc8686c13af0143adf4285d741256af824f70b7_96.webp'),
      mod('P7dR8mSH', 'fabric-api', 'Fabric API', '0.115.0+1.21.4', 'fabric-api-0.115.0+1.21.4.jar', 'https://cdn.modrinth.com/data/P7dR8mSH/icon.png')
    ]
  },
  {
    id: 'machinemagic',
    name: '机械与魔法',
    mcVersion: '1.20.1',
    loader: 'fabric',
    loaderVersion: '0.15.11',
    versionId: 'fabric-loader-0.15.11-1.20.1',
    icon: 'gem',
    accent: '#b8a1f5',
    memoryMb: 8192,
    createdAt: now - 86400000 * 74,
    lastPlayedAt: now - 86400000 * 3,
    totalPlayTimeMs: 1000 * 60 * 60 * 41,
    mods: [
      mod('LNytGWDc', 'create', 'Create', '6.0.4+mc1.20.1', 'create-1.20.1-6.0.4.jar', 'https://cdn.modrinth.com/data/LNytGWDc/61d716699bcf1ec42ed4926a9e1c7311be6087e2_96.webp'),
      mod('u6dRKJwZ', 'jei', 'Just Enough Items', '15.20.0.105', 'jei-1.20.1-forge-15.20.0.105.jar', 'https://cdn.modrinth.com/data/u6dRKJwZ/4a3f18ac0d096c9f8e9176984c44be4e58f94c89_96.webp'),
      mod('P7dR8mSH', 'fabric-api', 'Fabric API', '0.92.2+1.20.1', 'fabric-api-0.92.2+1.20.1.jar', 'https://cdn.modrinth.com/data/P7dR8mSH/icon.png')
    ]
  },
  {
    id: 'vanillabuild',
    name: '原版建筑服',
    mcVersion: '1.21.1',
    loader: 'vanilla',
    versionId: '1.21.1',
    icon: 'castle',
    accent: '#f2b860',
    memoryMb: 4096,
    createdAt: now - 86400000 * 12,
    lastPlayedAt: now - 86400000 * 8,
    totalPlayTimeMs: 1000 * 60 * 60 * 6 + 1000 * 60 * 41,
    mods: []
  },
  {
    id: 'forgetech',
    name: '蒸汽与齿轮',
    mcVersion: '1.20.1',
    loader: 'forge',
    loaderVersion: '47.4.0',
    versionId: '1.20.1-forge-47.4.0',
    icon: 'home',
    accent: '#f08a8a',
    memoryMb: 8192,
    createdAt: now - 86400000 * 55,
    lastPlayedAt: now - 86400000 * 5,
    totalPlayTimeMs: 1000 * 60 * 60 * 21,
    mods: []
  },
  {
    id: 'neofrontier',
    name: '新纪元',
    mcVersion: '1.21.4',
    loader: 'neoforge',
    loaderVersion: '21.4.161',
    versionId: 'neoforge-21.4.161',
    icon: 'compass',
    accent: '#6fd6b0',
    memoryMb: 6144,
    createdAt: now - 86400000 * 9,
    lastPlayedAt: now - 86400000 * 2,
    totalPlayTimeMs: 1000 * 60 * 60 * 4 + 1000 * 60 * 12,
    mods: []
  },
  {
    id: 'quiltsky',
    name: '轻量空岛',
    mcVersion: '1.21.4',
    loader: 'quilt',
    loaderVersion: '0.30.1',
    versionId: 'quilt-loader-0.30.1-1.21.4',
    icon: 'mountain',
    accent: '#8ecae6',
    memoryMb: 4096,
    createdAt: now - 86400000 * 3,
    lastPlayedAt: now - 86400000 * 1,
    totalPlayTimeMs: 1000 * 60 * 38,
    mods: []
  }
]

for (const instance of instances) {
  const modsDir = path.join(data, 'instances', instance.id, '.minecraft', 'mods')
  fs.mkdirSync(modsDir, { recursive: true })
  fs.mkdirSync(path.join(data, 'instances', instance.id, '.minecraft', 'logs'), { recursive: true })
  for (const item of instance.mods) {
    fs.writeFileSync(path.join(modsDir, item.fileName), `placeholder ${item.title}`)
  }
}

const accountUuid = uuid('Lime')
const skinsDir = path.join(home, 'skins')
fs.mkdirSync(skinsDir, { recursive: true })
fs.copyFileSync(path.join(root, 'test-artifacts', 'test-skin.png'), path.join(skinsDir, `${accountUuid}.png`))

fs.writeFileSync(
  path.join(home, 'config.json'),
  JSON.stringify(
    {
      schemaVersion: 1,
      settings: {
        memoryMb: 6144,
        javaPath: '',
        showSnapshots: false,
        minimizeOnLaunch: false,
        downloadConcurrency: 16
      },
      account: {
        name: 'Lime',
        uuid: accountUuid,
        type: 'offline',
        skin: {
          fileName: `${accountUuid}.png`,
          model: 'classic',
          appliedInstanceIds: []
        }
      },
      instances
    },
    null,
    2
  )
)

console.log(JSON.stringify({ home, data }))
