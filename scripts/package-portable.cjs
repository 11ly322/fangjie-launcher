const path = require('node:path')
const { packager } = require('@electron/packager')

const root = path.resolve(__dirname, '..')

packager({
  dir: root,
  name: 'Fangjie',
  platform: 'win32',
  arch: 'x64',
  out: path.join(root, 'release'),
  overwrite: true,
  asar: true,
  prune: true,
  extraResource: [path.join(root, 'resources', 'bin')],
  icon: path.join(root, 'resources', 'icon.ico'),
  appVersion: require(path.join(root, 'package.json')).version,
  ignore: [
    /^\/test-artifacts/,
    /^\/release/,
    /^\/scripts/,
    /^\/src/,
    /^\/docs/,
    /^\/resources\/bin/,
    /^\/\.git/,
    /^\/\.github/,
    /^\/\.gitattributes$/,
    /^\/\.gitignore$/,
    /^\/README\.md$/,
    /^\/CHANGELOG\.md$/,
    /^\/CONTRIBUTING\.md$/,
    /^\/SECURITY\.md$/,
    /^\/THIRD_PARTY_NOTICES\.md$/,
    /^\/LICENSE$/,
    /^\/package-lock\.json$/,
    /^\/tsconfig.*\.json$/,
    /^\/electron\.vite\.config\.ts$/
  ]
})
  .then(([output]) => {
    console.log(`Portable build: ${output}`)
    console.log(`Run: ${path.join(output, 'Fangjie.exe')}`)
  })
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
