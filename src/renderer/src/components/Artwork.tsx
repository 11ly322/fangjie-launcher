import {
  Castle,
  Compass,
  Gem,
  Home,
  Mountain,
  Pickaxe,
  Sword,
  Trees
} from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'

const ICONS: Record<string, ReactNode> = {
  pickaxe: <Pickaxe />,
  trees: <Trees />,
  castle: <Castle />,
  compass: <Compass />,
  gem: <Gem />,
  mountain: <Mountain />,
  home: <Home />,
  sword: <Sword />
}

export function BrandMark({ size = 38 }: { size?: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="unflod bindery launcher"
      className="brand-mark"
    >
      <defs>
        <linearGradient id="brand-top" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d7ff8a" />
          <stop offset="1" stopColor="#93c837" />
        </linearGradient>
        <linearGradient id="brand-left" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#719b2f" />
          <stop offset="1" stopColor="#354d18" />
        </linearGradient>
        <linearGradient id="brand-right" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#95c443" />
          <stop offset="1" stopColor="#4e6c20" />
        </linearGradient>
      </defs>
      <path d="M7 38h34v5a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" fill="#6a4a2c" />
      <path d="M7 38h34v2H7z" fill="#a8784d" />
      <path d="M11 10h7v26h-7z" fill="url(#brand-left)" />
      <path d="M18 6h8v30h-8z" fill="url(#brand-top)" />
      <path d="M26 13h7v23h-7z" fill="url(#brand-right)" />
      <path d="M31 16l5-2 4 20-5 2z" fill="#c49a62" />
      <path d="M13 14h3v4h-3zm0 7h3v4h-3zm8-10h4v4h-4zm0 7h4v4h-4z" fill="#f7ffe9" fillOpacity=".55" />
      <path d="M24 6v30M18 6v30M26 13v23" stroke="#e9ffc8" strokeOpacity=".25" strokeWidth="1" />
    </svg>
  )
}

export function PixelAvatar({
  name,
  size = 48,
  className
}: {
  name: string
  size?: number
  className?: string
}): React.JSX.Element {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) | 0
  }
  const skins = [
    ['#d9a066', '#f0c48c', '#4b2f1d'],
    ['#b77b4f', '#ddb088', '#2e2117'],
    ['#e0b48c', '#f3d2af', '#7b4d2d'],
    ['#8b5e3c', '#b9855b', '#24170f'],
    ['#c9906b', '#e5b68d', '#4a3322']
  ]
  const skin = skins[Math.abs(hash) % skins.length]
  const shirt = ['#5a8f4a', '#466b9d', '#8f5a4a', '#6e5a92', '#5a8f88'][Math.abs(hash >> 3) % 5]
  const pixels: string[] = []
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      let color = skin[1]
      if (row === 0 || (row === 1 && col > 0 && col < 7)) color = skin[2]
      if (col === 0 || col === 7) color = row < 2 ? skin[2] : skin[0]
      if (row === 3 && (col === 2 || col === 5)) color = '#19231a'
      if (row === 3 && (col === 1 || col === 6)) color = skin[0]
      if (row === 5 && (col === 3 || col === 4)) color = '#935a43'
      if (row >= 6) color = shirt
      if (row === 7 && col > 1 && col < 6) color = shade(shirt, -18)
      pixels.push(color)
    }
  }
  return (
    <span
      className={`pixel-avatar ${className || ''}`}
      style={{ width: size, height: size, gridTemplateColumns: 'repeat(8, 1fr)' }}
      role="img"
      aria-label={`${name} 的头像`}
    >
      {pixels.map((color, index) => (
        <span key={index} style={{ background: color }} />
      ))}
    </span>
  )
}

function shade(hex: string, amount: number): string {
  const value = hex.replace('#', '')
  const channels = [0, 2, 4].map((offset) => {
    const next = Math.max(0, Math.min(255, parseInt(value.slice(offset, offset + 2), 16) + amount))
    return next.toString(16).padStart(2, '0')
  })
  return `#${channels.join('')}`
}

export function SkinHead({
  dataUrl,
  size,
  className
}: {
  dataUrl: string
  size: number
  className?: string
}): React.JSX.Element {
  return (
    <span
      className={`skin-head ${className || ''}`}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${dataUrl})`,
        backgroundSize: '800% 800%',
        backgroundPosition: '14.2857% 14.2857%'
      }}
      role="img"
      aria-label="本地皮肤头像"
    />
  )
}

export function InstanceEmblem({
  accent,
  icon,
  size = 64,
  className
}: {
  accent: string
  icon: string
  size?: number
  className?: string
}): React.JSX.Element {
  const id = `emblem-${icon}-${accent.replace('#', '')}`
  return (
    <span
      className={`instance-emblem ${className || ''}`}
      style={{ width: size, height: size, '--emblem-accent': accent } as CSSProperties}
    >
      <svg viewBox="0 0 96 96" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-top`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={accent} />
            <stop offset="1" stopColor={shade(accent, -28)} />
          </linearGradient>
          <linearGradient id={`${id}-left`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#263323" />
            <stop offset="1" stopColor="#11170f" />
          </linearGradient>
          <linearGradient id={`${id}-right`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3b4a31" />
            <stop offset="1" stopColor="#192115" />
          </linearGradient>
          <filter id={`${id}-glow`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width="96" height="96" rx="24" fill="#111511" />
        <circle cx="72" cy="22" r="22" fill={accent} opacity=".08" />
        <circle cx="24" cy="80" r="26" fill={accent} opacity=".05" />
        <path d="M48 22 78 38 48 54 18 38Z" fill={`url(#${id}-top)`} />
        <path d="M18 38 48 54 48 82 18 66Z" fill={`url(#${id}-left)`} />
        <path d="M78 38 48 54 48 82 78 66Z" fill={`url(#${id}-right)`} />
        <path d="M18 38 48 54 48 82 18 66Z" fill={accent} fillOpacity=".07" />
        <path d="M48 22 78 38 48 54 18 38Z" fill="none" stroke={accent} strokeOpacity=".65" />
      </svg>
      <span
        className="instance-emblem__icon"
        style={{ color: '#0b0f09', width: size * 0.31, height: size * 0.31 }}
        aria-hidden="true"
      >
        {ICONS[icon] || <Pickaxe />}
      </span>
    </span>
  )
}

const PIXEL_SHELF = [
  '......................',
  '..aaa.bbb.ccc.ddd.....',
  '..aaa.bbb.ccc.ddd..e..',
  '..aaa.bbb.ccc.ddd..e..',
  '..aaa.bbb.ccc.ddd..e..',
  '######################',
  '......................',
  '..ff.ggg.hh.iii.jjj...',
  '..ff.ggg.hh.iii.jjj...',
  '..ff.ggg.hh.iii.jjj...',
  '######################'
]

const PIXEL_COLORS: Record<string, string> = {
  a: 'var(--pixel-accent, var(--accent))',
  b: '#ffd166',
  c: '#64d2ff',
  d: '#ff9f9a',
  e: '#b8a1f5',
  f: '#8ce3a4',
  g: '#ffb86b',
  h: '#bf5af2',
  i: '#30d158',
  j: '#5ac8fa'
}

export function PixelShelfArt({ accent }: { accent: string }): React.JSX.Element {
  return (
    <div
      className="pixel-shelf-art"
      style={{ '--pixel-accent': accent } as CSSProperties}
      aria-hidden="true"
    >
      {PIXEL_SHELF.flatMap((row, rowIndex) =>
        [...row].map((cell, columnIndex) => (
          <span
            key={`${rowIndex}-${columnIndex}`}
            className={`pixel-shelf-art__cell${cell === '#' ? ' is-shelf' : ''}`}
            style={cell === '.' || cell === '#' ? undefined : { background: PIXEL_COLORS[cell] }}
          />
        ))
      )}
    </div>
  )
}

export function WorldArt({ accent }: { accent: string }): React.JSX.Element {
  const id = accent.startsWith('var(') ? 'theme' : accent.replace('#', '')
  return (
    <svg className="world-art" viewBox="0 0 960 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`sky-${id}`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#1a251a" />
          <stop offset=".48" stopColor="#273523" />
          <stop offset="1" stopColor="#111710" />
        </linearGradient>
        <radialGradient id={`sun-${id}`} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor={accent} stopOpacity=".98" />
          <stop offset=".55" stopColor={accent} stopOpacity=".38" />
          <stop offset="1" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`hill-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#45583a" />
          <stop offset="1" stopColor="#1c2518" />
        </linearGradient>
        <linearGradient id={`grass-${id}`} x1="0" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor={accent} />
          <stop offset="1" stopColor="#4f7124" />
        </linearGradient>
        <linearGradient id={`dirt-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4d3a24" />
          <stop offset="1" stopColor="#241b12" />
        </linearGradient>
        <pattern id={`grid-${id}`} width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M48 0H0V48" fill="none" stroke="#d7ffb3" strokeOpacity=".035" />
        </pattern>
        <filter id={`soft-${id}`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
      </defs>
      <rect width="960" height="520" fill={`url(#sky-${id})`} />
      <rect width="960" height="520" fill={`url(#grid-${id})`} />
      <circle cx="720" cy="160" r="220" fill={`url(#sun-${id})`} />
      <circle cx="720" cy="160" r="74" fill={accent} opacity=".84" filter={`url(#soft-${id})`} />
      <g opacity=".42">
        <path d="M0 366 122 238 208 314 326 196 480 356Z" fill="#1b2518" />
        <path d="M420 370 576 236 680 312 786 224 960 360 960 520 420 520Z" fill="#182214" />
      </g>
      <g opacity=".13" fill="#d9ffc0">
        <rect x="230" y="96" width="3" height="3" />
        <rect x="430" y="64" width="2" height="2" />
        <rect x="616" y="80" width="3" height="3" />
        <rect x="850" y="52" width="2" height="2" />
        <rect x="86" y="154" width="2" height="2" />
        <rect x="342" y="132" width="2" height="2" />
        <rect x="906" y="146" width="3" height="3" />
      </g>

      <g transform="translate(500 334)">
        <ellipse cx="120" cy="124" rx="190" ry="36" fill="#080b06" opacity=".35" />
        <g transform="translate(120 34)">
          <path d="M0 0 96 48 0 96-96 48Z" fill={`url(#grass-${id})`} />
          <path d="M-96 48 0 96V202l-96-48Z" fill={`url(#dirt-${id})`} />
          <path d="M96 48 0 96v106l96-48Z" fill="#332619" />
          <path d="M-96 48 0 96V202l-96-48Z" fill="#000" opacity=".14" />
          <path d="M0 0 96 48 0 96-96 48Z" fill="none" stroke="#e4ffc5" strokeOpacity=".18" />
          <g opacity=".32" fill="#0a0e07">
            <rect x="-58" y="96" width="15" height="15" />
            <rect x="-28" y="127" width="15" height="15" />
            <rect x="-66" y="144" width="15" height="15" />
            <path d="M34 108h14v14H34z" />
          </g>
          <g transform="translate(-8 -26)">
            <path d="M0 0 54 27 0 54-54 27Z" fill="#8cb34d" />
            <path d="M-54 27 0 54v58l-54-27Z" fill="#5f7736" />
            <path d="M54 27 0 54v58l54-27Z" fill="#405426" />
            <path d="M0 0 54 27 0 54-54 27Z" fill="none" stroke="#d8f9a2" strokeOpacity=".45" />
          </g>
          <g transform="translate(44 -47) scale(.7)">
            <path d="M0 0 38 19 0 38-38 19Z" fill={accent} />
            <path d="M-38 19 0 38v42l-38-19Z" fill="#627c35" />
            <path d="M38 19 0 38v42l38-19Z" fill="#3f5524" />
          </g>
        </g>
        <g fill={accent} opacity=".5">
          <circle cx="-160" cy="80" r="3" />
          <circle cx="240" cy="36" r="2" />
          <circle cx="280" cy="142" r="4" opacity=".35" />
          <circle cx="-220" cy="180" r="2" />
        </g>
        <g fill="#0a0e08">
          <path d="M-280 152h18v54h-18z" />
          <path d="M-300 146h58v14h-58z" />
          <path d="M-300 200h58v14h-58z" />
        </g>
      </g>

      <g opacity=".38" fill="#d7ffb3">
        <path d="M132 348h12v12h-12z" />
        <path d="M148 364h8v8h-8z" />
        <path d="M812 298h10v10h-10z" />
        <path d="M828 310h6v6h-6z" />
      </g>
      <rect x="0" y="446" width="960" height="74" fill="#0b0f09" opacity=".5" />
      <path d="M0 452 84 410l70 33 86-47 92 52 66-32 82 45 96-58 88 49 74-38 122 57v49H0Z" fill="#0d130c" opacity=".82" />
      <path d="M0 452 84 410l70 33 86-47 92 52 66-32 82 45 96-58 88 49 74-38 122 57" fill="none" stroke={accent} strokeOpacity=".14" />
      <linearGradient id={`fade-${id}`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#111710" stopOpacity=".97" />
        <stop offset=".4" stopColor="#111710" stopOpacity=".3" />
        <stop offset="1" stopColor="#111710" stopOpacity="0" />
      </linearGradient>
      <rect width="960" height="520" fill={`url(#fade-${id})`} />
    </svg>
  )
}

export function BlockStack(): React.JSX.Element {
  return (
    <svg className="block-stack" viewBox="0 0 180 160" aria-hidden="true">
      <defs>
        <linearGradient id="bs-top" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d5ff89" />
          <stop offset="1" stopColor="#93c837" />
        </linearGradient>
      </defs>
      <ellipse cx="90" cy="139" rx="63" ry="13" fill="#000" opacity=".25" />
      <g transform="translate(90 58)">
        <path d="M0 0 50 25 0 50-50 25Z" fill="url(#bs-top)" />
        <path d="M-50 25 0 50v48l-50-25Z" fill="#42592a" />
        <path d="M50 25 0 50v48l50-25Z" fill="#2c3e1d" />
      </g>
      <g transform="translate(42 42) scale(.55)">
        <path d="M0 0 50 25 0 50-50 25Z" fill="#b6a27a" />
        <path d="M-50 25 0 50v48l-50-25Z" fill="#6b5a42" />
        <path d="M50 25 0 50v48l50-25Z" fill="#4b3e2c" />
      </g>
      <g transform="translate(138 40) scale(.42)">
        <path d="M0 0 50 25 0 50-50 25Z" fill="#8ecae6" />
        <path d="M-50 25 0 50v48l-50-25Z" fill="#4c7f99" />
        <path d="M50 25 0 50v48l50-25Z" fill="#315c72" />
      </g>
    </svg>
  )
}
