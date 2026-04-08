const fs = require('fs')
const path = require('path')

const { resolveRuntimeDir } = require('../src/utils/runtimeDir')
const { listConfiguredSportsImagePackageEntries } = require('../src/utils/sportsImagePackage')
const { importSportsImageFile } = require('../src/utils/sportsImageCache')

function loadLocalEnv(filePath) {
  if (!fs.existsSync(filePath)) return
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  for (const rawLine of lines) {
    const line = String(rawLine || '').trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator === -1) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

async function run() {
  const repoRoot = path.resolve(__dirname, '..')
  loadLocalEnv(path.join(repoRoot, '.env'))

  const overridePath = String(process.argv[2] || '').trim()
  if (overridePath) {
    process.env.PVTKRRX_SPORTS_IMAGE_PACKAGE_PATH = overridePath
  }

  const runtimeDir = resolveRuntimeDir(process.env)
  const entries = listConfiguredSportsImagePackageEntries({ runtimeDir })

  if (!entries.length) {
    throw new Error('No sports image package entries found. Set PVTKRRX_SPORTS_IMAGE_PACKAGE_PATH or save Sports Poster Package Path in configure first.')
  }

  let imported = 0
  let failed = 0

  console.log(`[cache:sports-package] runtime dir: ${runtimeDir}`)
  console.log(`[cache:sports-package] syncing ${entries.length} packaged image entries`)

  for (const entry of entries) {
    try {
      importSportsImageFile(entry.sourceUrl, entry.filePath, {
        contentType: entry.contentType,
        cacheStatus: 'package-import',
        packageName: entry.packageName
      })
      imported += 1
    } catch (error) {
      failed += 1
      console.warn(`[cache:sports-package] failed for ${entry.sourceUrl}: ${error.message}`)
    }
  }

  console.log(`[cache:sports-package] summary: ${imported} imported, ${failed} failed`)
}

if (require.main === module) {
  run().catch((error) => {
    console.error(`[cache:sports-package] failed: ${error.message}`)
    process.exit(1)
  })
}

module.exports = {
  run
}
