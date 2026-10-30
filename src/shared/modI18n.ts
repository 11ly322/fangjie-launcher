const TITLE_ENTRIES: Array<[string, string]> = [
  ['sodium', '钠'],
  ['iris', 'Iris 光影'],
  ['lithium', '锂'],
  ['phosphor', '磷'],
  ['ferritecore', '铁氧体核心'],
  ['krypton', '氪'],
  ['modernfix', 'ModernFix 优化'],
  ['entityculling', '实体剔除'],
  ['indium', '铟'],
  ['continuity', '连接纹理'],
  ['sodium-extra', '钠扩展'],
  ['reeses-sodium-options', '钠选项'],
  ['create', '机械动力'],
  ['jei', 'JEI 物品管理器'],
  ['rei', 'REI 物品管理器'],
  ['emi', 'EMI 物品管理器'],
  ['fabric-api', 'Fabric API'],
  ['architectury-api', 'Architectury API'],
  ['cloth-config', 'Cloth Config'],
  ['geckolib', 'GeckoLib'],
  ['jade', 'Jade 信息显示'],
  ['wthit', 'WTHIT 信息显示'],
  ['xaeros-minimap', 'Xaero 小地图'],
  ['xaeros-world-map', 'Xaero 世界地图'],
  ['journeymap', 'JourneyMap 地图'],
  ['twilightforest', '暮色森林'],
  ['biomesoplenty', '超多生物群系'],
  ['terralith', 'Terralith 地形'],
  ['appleskin', 'AppleSkin 饱食度'],
  ['mouse-tweaks', '鼠标手势'],
  ['controlling', '按键控制'],
  ['modmenu', 'Mod Menu'],
  ['lambdynamiclights', '动态光源'],
  ['botania', '植物魔法'],
  ['mekanism', '通用机械'],
  ['thermal', '热力系列'],
  ['ae2', '应用能源 2'],
  ['refinedstorage', '精炼存储'],
  ['sophisticatedbackpacks', '精致背包'],
  ['farmersdelight', '农夫乐事'],
  ['croptopia', '作物盛景'],
  ['origins', '起源'],
  ['apotheosis', '神化'],
  ['epicfight', '史诗战斗'],
  ['parcool', '跑酷'],
  ['distant-horizons', '远处的地平线'],
  ['alexsmobs', 'Alex 的生物'],
  ['alexs-caves', 'Alex 的洞穴'],
  ['naturalist', '自然学家'],
  ['when-dungeons-arise', '地牢崛起'],
  ['dungeons-and-taverns', '地牢与酒馆'],
  ['illager-invasion', '灾厄入侵'],
  ['farmers-respite', '农夫暇事'],
  ['quark', '夸克'],
  ['supplementaries', '附属物'],
  ['waystones', '传送石碑'],
  ['comforts', '舒适露营'],
  ['corpse', '尸体找回']
]

const TITLE_BY_KEY = new Map<string, string>()
for (const [key, value] of TITLE_ENTRIES) {
  TITLE_BY_KEY.set(normalize(key), value)
}

const TERM_ENTRIES = ([
  ['quality of life', '实用增强'],
  ['client-side', '客户端'],
  ['server-side', '服务端'],
  ['resource pack', '资源包'],
  ['shader pack', '光影包'],
  ['world generation', '世界生成'],
  ['frame rate', '帧率'],
  ['game mechanics', '游戏机制'],
  ['compatible with', '兼容'],
  ['compatibility', '兼容性'],
  ['dependencies', '依赖'],
  ['dependency', '前置'],
  ['configuration', '配置'],
  ['performance', '性能'],
  ['optimization', '优化'],
  ['optimized', '优化'],
  ['features', '功能'],
  ['feature', '功能'],
  ['mobs', '生物'],
  ['entities', '实体'],
  ['biomes', '生物群系'],
  ['structures', '结构'],
  ['dimensions', '维度'],
  ['recipes', '配方'],
  ['storage', '存储'],
  ['automation', '自动化'],
  ['redstone', '红石'],
  ['combat', '战斗'],
  ['adventure', '冒险'],
  ['decoration', '装饰'],
  ['building', '建筑'],
  ['farming', '农业'],
  ['transportation', '交通'],
  ['technology', '科技'],
  ['magic', '魔法'],
  ['library', '前置库'],
  ['required', '必需'],
  ['optional', '可选'],
  ['incompatible', '不兼容'],
  ['supported', '支持'],
  ['support', '支持'],
  ['shaders', '光影'],
  ['blocks', '方块'],
  ['items', '物品'],
  ['food', '食物'],
  ['utility', '实用'],
  ['qol', '实用增强'],
  ['fps', '帧率'],
  ['worldgen', '世界生成']
] as Array<[string, string]>).sort((left, right) => right[0].length - left[0].length)

const TERM_PATTERN = new RegExp(
  `(?<![A-Za-z])(${TERM_ENTRIES.map(([term]) => escapeRegExp(term)).join('|')})(?![A-Za-z])`,
  'gi'
)
const TERM_ZH = new Map(TERM_ENTRIES.map(([term, value]) => [term.toLowerCase(), value]))

const QUERY_ALIASES = ([
  ['机械动力', 'create'],
  ['暮色森林', 'twilight forest'],
  ['植物魔法', 'botania'],
  ['通用机械', 'mekanism'],
  ['应用能源', 'applied energistics'],
  ['物品管理器', 'jei'],
  ['小地图', 'minimap'],
  ['世界地图', 'world map'],
  ['超多生物群系', 'biomes'],
  ['农夫乐事', 'farmers delight'],
  ['精致背包', 'sophisticated backpacks'],
  ['动态光源', 'dynamic lights'],
  ['连接纹理', 'continuity'],
  ['实体剔除', 'entity culling'],
  ['钠', 'sodium'],
  ['锂', 'lithium'],
  ['优化', 'optimization'],
  ['性能', 'performance'],
  ['科技', 'technology'],
  ['魔法', 'magic'],
  ['冒险', 'adventure'],
  ['装饰', 'decoration'],
  ['世界生成', 'worldgen'],
  ['前置', 'library'],
  ['地图', 'map'],
  ['光影', 'shader'],
  ['资源包', 'resource pack'],
  ['机械', 'create'],
  ['能源', 'energy'],
  ['农业', 'farming'],
  ['食物', 'food'],
  ['战斗', 'combat'],
  ['生物', 'mobs'],
  ['装备', 'equipment'],
  ['存储', 'storage'],
  ['建筑', 'building'],
  ['红石', 'redstone'],
  ['交通', 'transportation'],
  ['实用', 'utility qol'],
  ['客户端', 'client'],
  ['服务端', 'server']
] as Array<[string, string]>).sort((left, right) => right[0].length - left[0].length)

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function hasChinese(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value)
}

/** Translate a Chinese workshop query into English keywords accepted by both APIs. */
export function translateSearchQuery(query: string): string {
  const trimmed = query.trim()
  if (!trimmed || !hasChinese(trimmed)) return trimmed
  let result = trimmed
  for (const [zh, en] of QUERY_ALIASES) {
    if (result.includes(zh)) result = result.split(zh).join(` ${en} `)
  }
  const translated = result.replace(/\s+/g, ' ').trim()
  return translated === trimmed ? trimmed : translated
}

export function translateModTitle(project: {
  title: string
  slug?: string
  project_id?: string
}): string {
  const candidates = [
    project.slug,
    project.project_id?.replace(/^cf-/, ''),
    project.title
  ].filter((value): value is string => Boolean(value))
  for (const candidate of candidates) {
    const translated = TITLE_BY_KEY.get(normalize(candidate))
    if (translated) return translated
  }
  const createPrefix = project.title.match(/^create(?=\s*:|\s|$)/i)
  if (createPrefix) {
    return `机械动力${project.title.slice(createPrefix[0].length)}`
  }
  return project.title
}

/** Replace common English mod/category terms in display text. URLs are left untouched. */
export function translateModText(text: string): string {
  if (!text) return text
  return text
    .split(/(https?:\/\/[^\s)]+)/g)
    .map((part, index) => {
      if (index % 2 === 1) return part
      return part.replace(TERM_PATTERN, (match) => TERM_ZH.get(match.toLowerCase()) || match)
    })
    .join('')
}

export function translateModDescription(project: { description?: string }): string {
  return translateModText(project.description || '')
}

export function translateModBody(project: { body?: string }): string {
  return translateModText(project.body || '')
}
