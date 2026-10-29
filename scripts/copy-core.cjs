const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const release = process.argv.includes('--release')
const targetRoot = process.env.CARGO_TARGET_DIR
  ? path.resolve(process.env.CARGO_TARGET_DIR)
  : path.join(root, 'rust', 'fangjie-core', 'target')
const source = path.join(targetRoot, release ? 'release' : 'debug', 'fangjie-core-sidecar.exe')
const destination = path.join(root, 'resources', 'bin', 'fangjie-core-sidecar.exe')

if (!fs.existsSync(source)) {
  console.error(`Missing ${source}. Run cargo build first.`)
  process.exit(1)
}
fs.mkdirSync(path.dirname(destination), { recursive: true })
fs.copyFileSync(source, destination)
console.log(`Copied ${source} -> ${destination}`)
