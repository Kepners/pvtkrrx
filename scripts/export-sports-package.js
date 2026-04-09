const fs = require('fs')
const path = require('path')

const { resolveRuntimeDir } = require('../src/utils/runtimeDir')

const CACHE_ROOT_NAME = 'sports-image-cache'

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

  const runtimeDir = resolveRuntimeDir(process.env)
  const cacheDir = path.join(runtimeDir, CACHE_ROOT_NAME)

  if (!fs.existsSync(cacheDir)) {
    throw new Error(`Sports image cache not found at ${cacheDir}`)
  }

  // Output destination — first CLI arg or default to dist/sports-package
  const outputDir = path.resolve(
    String(process.argv[2] || '').trim() || path.join(repoRoot, 'dist', 'sports-package')
  )
  const imagesDir = path.join(outputDir, 'images')

  console.log(`[export-sports-package] cache dir: ${cacheDir}`)
  console.log(`[export-sports-package] output dir: ${outputDir}`)

  // Scan all metadata sidecars
  const files = fs.readdirSync(cacheDir).filter(f => f.endsWith('.json'))
  console.log(`[export-sports-package] found ${files.length} metadata entries`)

  const imagesBySourceUrl = {}
  let skipped = 0
  let exported = 0

  for (const metaFile of files) {
    const metaPath = path.join(cacheDir, metaFile)
    let meta
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    } catch (_) {
      skipped++
      continue
    }

    if (!meta?.sourceUrl || !meta?.ext || !meta?.cacheKey) {
      skipped++
      continue
    }

    const imageFile = `${meta.cacheKey}${meta.ext}`
    const imagePath = path.join(cacheDir, imageFile)
    if (!fs.existsSync(imagePath)) {
      skipped++
      continue
    }

    // Use content-type-based extension for clean filenames in package
    const destFilename = `${meta.cacheKey}${meta.ext}`
    const relativePath = `./images/${destFilename}`

    imagesBySourceUrl[meta.sourceUrl] = {
      path: relativePath,
      contentType: meta.contentType || ''
    }

    exported++
  }

  console.log(`[export-sports-package] ${exported} valid entries, ${skipped} skipped`)

  if (exported === 0) {
    throw new Error('No valid cache entries to export')
  }

  // Create output directories
  fs.mkdirSync(imagesDir, { recursive: true })

  // Write manifest first
  const manifest = {
    name: `PVTKRRX Sports Package ${new Date().toISOString().slice(0, 10)}`,
    version: 1,
    createdAt: new Date().toISOString(),
    entryCount: exported,
    imagesBySourceUrl
  }

  const manifestPath = path.join(outputDir, 'sports-image-package.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
  console.log(`[export-sports-package] manifest written: ${manifestPath}`)

  // Copy images
  let copied = 0
  let copyFailed = 0
  const sourceUrls = Object.keys(imagesBySourceUrl)

  for (const sourceUrl of sourceUrls) {
    const entry = imagesBySourceUrl[sourceUrl]
    const destFilename = path.basename(entry.path)
    const srcPath = path.join(cacheDir, destFilename)
    const destPath = path.join(imagesDir, destFilename)

    try {
      fs.copyFileSync(srcPath, destPath)
      copied++
    } catch (err) {
      copyFailed++
      console.warn(`[export-sports-package] copy failed: ${destFilename} — ${err.message}`)
    }

    // Progress every 500 files
    if ((copied + copyFailed) % 500 === 0) {
      console.log(`[export-sports-package] progress: ${copied + copyFailed}/${sourceUrls.length}`)
    }
  }

  // Calculate total size
  let totalBytes = 0
  try {
    const destFiles = fs.readdirSync(imagesDir)
    for (const f of destFiles) {
      totalBytes += fs.statSync(path.join(imagesDir, f)).size
    }
  } catch (_) {
    // ignore
  }

  const sizeMB = (totalBytes / (1024 * 1024)).toFixed(1)

  console.log(`[export-sports-package] done!`)
  console.log(`[export-sports-package] ${copied} images copied, ${copyFailed} failed`)
  console.log(`[export-sports-package] total size: ${sizeMB} MB`)
  console.log(`[export-sports-package] package: ${outputDir}`)
  console.log('')
  console.log('To distribute:')
  console.log(`  1. Zip the "${path.basename(outputDir)}" folder`)
  console.log('  2. Give it to the recipient')
  console.log('  3. They set PVTKRRX_SPORTS_IMAGE_PACKAGE_PATH to the unzipped folder')
  console.log('  4. Or run: npm run cache:sports-package <path-to-folder>')
}

if (require.main === module) {
  try {
    run()
  } catch (error) {
    console.error(`[export-sports-package] failed: ${error.message}`)
    process.exit(1)
  }
}

module.exports = { run }
