const fs = require('fs')
const path = require('path')

const { importSportsMetaCatalogue } = require('../src/utils/sportsmetaCatalogue')

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

function run() {
  const repoRoot = path.resolve(__dirname, '..')
  loadLocalEnv(path.join(repoRoot, '.env'))

  const overrideRuntimeDir = String(process.argv[2] || '').trim()
  const summary = importSportsMetaCatalogue({
    runtimeDir: overrideRuntimeDir || undefined
  })

  console.log(`[sportsmeta:import] runtime dir: ${summary.runtimeDir}`)
  console.log(`[sportsmeta:import] db path: ${summary.dbPath}`)
  console.log(`[sportsmeta:import] asset sidecars scanned: ${summary.assetSidecars}`)
  console.log(`[sportsmeta:import] assets imported: ${summary.assetsImported}`)
  console.log(`[sportsmeta:import] asset sidecars skipped: ${summary.assetSkipped}`)
  console.log(`[sportsmeta:import] poster cache entries: ${summary.posterCacheEntries}`)
  console.log(`[sportsmeta:import] records imported: ${summary.recordsImported}`)
  console.log(`[sportsmeta:import] record entries skipped: ${summary.recordSkipped}`)
  console.log(`[sportsmeta:import] aliases imported: ${summary.aliasesImported}`)
  console.log(`[sportsmeta:import] asset rows total: ${summary.assetCount}`)
  console.log(`[sportsmeta:import] record rows total: ${summary.recordCount}`)
  console.log(`[sportsmeta:import] alias rows total: ${summary.aliasCount}`)
}

if (require.main === module) {
  try {
    run()
  } catch (error) {
    console.error(`[sportsmeta:import] failed: ${error.message}`)
    process.exit(1)
  }
}

module.exports = {
  run
}
