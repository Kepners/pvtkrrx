const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const builder = require('electron-builder')
const pkg = require('../package.json')

const rootDir = path.join(__dirname, '..')
const distDir = path.join(rootDir, 'dist')
const tempOutputDir = path.join(os.tmpdir(), `pvtkrrx-build-${pkg.version}`)

function copyBuildOutput(sourceDir, targetDir) {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)
    if (entry.isDirectory()) {
      fs.cpSync(sourcePath, targetPath, { recursive: true, force: true })
      continue
    }
    fs.copyFileSync(sourcePath, targetPath)
  }
}

async function main() {
  fs.rmSync(tempOutputDir, { recursive: true, force: true })
  fs.mkdirSync(tempOutputDir, { recursive: true })

  const buildConfig = pkg.build || {}
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'

  await builder.build({
    targets: builder.Platform.WINDOWS.createTarget(['nsis', 'portable']),
    config: {
      ...buildConfig,
      directories: {
        ...(buildConfig.directories || {}),
        output: tempOutputDir
      }
    },
    publish: 'never'
  })

  execFileSync(process.execPath, [path.join(__dirname, 'prepare-dist.js')], {
    cwd: rootDir,
    stdio: 'inherit'
  })

  copyBuildOutput(tempOutputDir, distDir)

  execFileSync(process.execPath, [path.join(__dirname, 'archive-dist.js')], {
    cwd: rootDir,
    stdio: 'inherit'
  })

  console.log(`[build-win] ready: ${path.join(distDir, `PVTKRRX Setup ${pkg.version}.exe`)}`)
  console.log(`[build-win] ready: ${path.join(distDir, `PVTKRRX ${pkg.version}.exe`)}`)
}

main().catch((err) => {
  console.error('[build-win] failed:', err && err.stack ? err.stack : err)
  process.exit(1)
})
