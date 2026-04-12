const fs = require('fs')
const path = require('path')

const { resolveRuntimeDir } = require('../src/utils/runtimeDir')
const { seedSportsImageCache, summarizeSportsImageSeed } = require('../src/utils/sportsCacheSeeder')
const { resolveSportsCacheApiKey } = require('../src/utils/sportsCacheAutofill')

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

  const runtimeDir = resolveRuntimeDir(process.env)
  const apiKey = resolveSportsCacheApiKey({ runtimeDir })

  console.log(`[cache:sports] runtime dir: ${runtimeDir}`)
  console.log(`[cache:sports] cache dir: ${path.join(runtimeDir, 'sports-image-cache')}`)
  const summary = await seedSportsImageCache({
    apiKey,
    logger: console
  })
  if (summary?.disabled) {
    console.log('[cache:sports] skipped: no TheSportsDB API key configured')
  }
  console.log(`[cache:sports] summary: ${summarizeSportsImageSeed(summary)}`)
}

if (require.main === module) {
  run().catch((error) => {
    console.error(`[cache:sports] failed: ${error.message}`)
    process.exit(1)
  })
}

module.exports = {
  run
}
