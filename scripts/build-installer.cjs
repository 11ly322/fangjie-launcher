const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const packageJson = require(path.join(root, 'package.json'))
const portableDir = path.join(root, 'release', 'Fangjie-win32-x64')
const exe = path.join(portableDir, 'Fangjie.exe')
const output = path.join(root, 'release', `Fangjie-Launcher-${packageJson.version}-Setup.exe`)

if (!fs.existsSync(exe)) {
  console.error(`Portable build not found: ${exe}`)
  console.error('Run "npm run package" first.')
  process.exit(1)
}

const candidates = [
  process.env.MAKENSIS,
  path.join(
    process.env.LOCALAPPDATA || '',
    'electron-builder',
    'Cache',
    'nsis',
    'nsis-3.0.4.1',
    'Bin',
    'makensis.exe'
  ),
  path.join(
    process.env.LOCALAPPDATA || '',
    'electron-builder',
    'Cache',
    'nsis',
    'nsis-3.0.4.1',
    'makensis.exe'
  ),
  path.join(process.env['ProgramFiles(x86)'] || '', 'NSIS', 'makensis.exe'),
  path.join(process.env.ProgramFiles || '', 'NSIS', 'makensis.exe')
].filter(Boolean)

const makensis = candidates.find((candidate) => fs.existsSync(candidate))
if (!makensis) {
  console.error('NSIS makensis was not found.')
  console.error('Install NSIS 3.x or set MAKENSIS to makensis.exe.')
  process.exit(1)
}

fs.rmSync(output, { force: true })
console.log(`NSIS: ${makensis}`)
console.log(`Output: ${output}`)

const result = spawnSync(
  makensis,
  [
    '/V2',
    `/DPROJECT_ROOT=${root}`,
    `/DAPP_VERSION=${packageJson.version}`,
    '/DAPP_VERSION_NUMERIC=0.0.1.0',
    path.join(root, 'scripts', 'installer.nsi')
  ],
  { cwd: root, stdio: 'inherit', windowsHide: false }
)

if (result.error) throw result.error
if (result.status !== 0) {
  process.exit(result.status || 1)
}

const stat = fs.statSync(output)
console.log(`Installer: ${output} (${(stat.size / 1024 / 1024).toFixed(1)} MiB)`)
