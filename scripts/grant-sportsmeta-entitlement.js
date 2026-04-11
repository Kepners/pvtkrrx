const fs = require('fs')
const path = require('path')

const { upsertSportsMetaEntitlement } = require('../src/utils/sportsmetaCatalogue')

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

  const accountUserId = String(process.argv[2] || '').trim()
  if (!accountUserId) {
    throw new Error('Usage: npm run experimental:sportsmeta:grant -- <accountUserId> [days]')
  }

  const days = Math.max(1, Number.parseInt(String(process.argv[3] || '365').trim(), 10) || 365)
  const expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000)
  const entitlement = upsertSportsMetaEntitlement({
    accountUserId,
    tier: 'sportsmeta',
    plan: days >= 365 ? 'annual' : `manual-${days}-day`,
    expiresAt,
    source: 'manual-cli'
  })

  console.log(`[sportsmeta:grant] account user: ${entitlement.accountUserId}`)
  console.log(`[sportsmeta:grant] tier: ${entitlement.tier}`)
  console.log(`[sportsmeta:grant] plan: ${entitlement.plan}`)
  console.log(`[sportsmeta:grant] expires: ${new Date(entitlement.expiresAt).toISOString()}`)
}

if (require.main === module) {
  try {
    run()
  } catch (error) {
    console.error(`[sportsmeta:grant] failed: ${error.message}`)
    process.exit(1)
  }
}

module.exports = {
  run
}
