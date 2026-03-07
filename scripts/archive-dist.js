const fs = require('fs')
const path = require('path')
const pkg = require('../package.json')

const distDir = path.join(__dirname, '..', 'dist')
const releasesDir = path.join(distDir, 'releases')
const versionDir = path.join(releasesDir, pkg.version)
const excludedEntries = new Set(['releases'])

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function resetDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true })
  fs.mkdirSync(dirPath, { recursive: true })
}

function listVersions(rootDir) {
  if (!fs.existsSync(rootDir)) return []
  return fs.readdirSync(rootDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }))
}

function copyEntry(name) {
  const sourcePath = path.join(distDir, name)
  const targetPath = path.join(versionDir, name)
  const stats = fs.statSync(sourcePath)

  if (stats.isDirectory()) {
    fs.cpSync(sourcePath, targetPath, { recursive: true })
    return `${name}/`
  }

  fs.copyFileSync(sourcePath, targetPath)
  return name
}

ensureDir(releasesDir)
resetDir(versionDir)

const archived = []
for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
  if (excludedEntries.has(entry.name)) continue
  archived.push(copyEntry(entry.name))
}

fs.writeFileSync(path.join(releasesDir, 'index.json'), JSON.stringify({
  current: pkg.version,
  versions: listVersions(releasesDir)
}, null, 2))

console.log(`[archive-dist] archived ${archived.length} item(s) to ${versionDir}`)
