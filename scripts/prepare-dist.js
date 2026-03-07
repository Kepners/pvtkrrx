const fs = require('fs')
const path = require('path')

const distDir = path.join(__dirname, '..', 'dist')
const preservedEntries = new Set(['releases'])

if (!fs.existsSync(distDir)) {
  process.exit(0)
}

let removed = 0
for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
  if (preservedEntries.has(entry.name)) continue
  fs.rmSync(path.join(distDir, entry.name), { recursive: true, force: true })
  removed += 1
}

console.log(`[prepare-dist] removed ${removed} stale item(s) from ${distDir}`)
