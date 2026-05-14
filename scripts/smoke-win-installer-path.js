const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

if (process.platform !== 'win32') {
  console.log('Smoke Windows installer path guard skipped on non-Windows host')
  process.exit(0)
}

const repoRoot = path.join(__dirname, '..')
const systemRoot = process.env.SystemRoot || 'C:\\Windows'
const driveRoot = path.parse(systemRoot).root || 'C:\\'
const accidentalRootProgramPath = path.join(driveRoot, 'Program')
const expectedInstallDir = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PVTKRRX')
const installerScriptPath = path.join(repoRoot, 'build', 'installer.nsh')
const installerScript = fs.readFileSync(installerScriptPath, 'utf8')

assert.doesNotMatch(
  installerScript,
  /nsExec::ExecTo(?:Log|Stack)\s+['"]?\s*"?\$appExe\b/i,
  'NSIS install phase must not synchronously run the installed app; that can freeze the setup progress bar.'
)

assert.doesNotMatch(
  installerScript,
  /--pvtkrrx-network-access-only/i,
  'Windows LAN access checks must run from the desktop first-launch provisioning path, not the blocking NSIS install phase.'
)

const releaseTextFiles = [
  'package.json',
  'build/installer.nsh',
  'scripts/install-selfhost.sh',
  ...collectTextFiles('electron'),
  ...collectTextFiles('src'),
  ...collectTextFiles('public')
]

const forbiddenReleaseText = [
  /PCNESTSPEAKER/i,
  /PCnestspeaker/i,
  /C:[/\\]+Users[/\\]+kepne/i,
  /\/home\/kepners/i,
  /\/mnt\/c\/Users\/kepne/i,
  /pvt\.kepners\.co\.uk/i
]

for (const relativePath of releaseTextFiles) {
  const absolutePath = path.join(repoRoot, relativePath)
  const text = fs.readFileSync(absolutePath, 'utf8')
  for (const pattern of forbiddenReleaseText) {
    assert.doesNotMatch(
      text,
      pattern,
      `${relativePath} contains machine-local or owner-private text that must not ship in release surfaces.`
    )
  }
}

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

function collectTextFiles(relativeDir) {
  const root = path.join(repoRoot, relativeDir)
  const out = []
  const allowedExtensions = new Set([
    '.css',
    '.html',
    '.js',
    '.json',
    '.md',
    '.mjs',
    '.nsh',
    '.sh',
    '.svg',
    '.txt',
    '.yml'
  ])

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.isFile()) continue
      if (!allowedExtensions.has(path.extname(entry.name).toLowerCase())) continue
      out.push(path.relative(repoRoot, full).replace(/\\/g, '/'))
    }
  }

  walk(root)
  return out
}
