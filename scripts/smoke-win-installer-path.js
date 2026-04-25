const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

if (process.platform !== 'win32') {
  console.log('Smoke Windows installer path guard skipped on non-Windows host')
  process.exit(0)
}

const systemRoot = process.env.SystemRoot || 'C:\\Windows'
const driveRoot = path.parse(systemRoot).root || 'C:\\'
const accidentalRootProgramPath = path.join(driveRoot, 'Program')
const expectedInstallDir = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PVTKRRX')

assert.equal(
  fs.existsSync(accidentalRootProgramPath),
  false,
  `${accidentalRootProgramPath} exists. This usually means a silent NSIS installer test split an unquoted "Program Files" path; remove only after proving it is empty and not referenced.`
)

if (fs.existsSync(expectedInstallDir)) {
  const stat = fs.statSync(expectedInstallDir)
  assert.equal(stat.isDirectory(), true, `${expectedInstallDir} should be a directory when present`)
}

console.log('Smoke Windows installer path guard passed')
