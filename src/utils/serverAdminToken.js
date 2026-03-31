const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

function getServerAdminTokenFilePath(runtimeDir, env = process.env) {
  const explicit = String(env?.PVTKRRX_SERVER_ADMIN_TOKEN_FILE || '').trim()
  if (explicit) return explicit
  return path.join(String(runtimeDir || '').trim() || process.cwd(), 'server-admin-token')
}

function writeTokenFile(filePath, token) {
  const target = String(filePath || '').trim()
  if (!target) throw new Error('server admin token file path is required')
  const dir = path.dirname(target)
  if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(target, `${String(token || '').trim()}\n`, { encoding: 'utf8', mode: 0o600 })
  try {
    fs.chmodSync(target, 0o600)
  } catch (_) {}
}

function ensureServerAdminToken(runtimeDir, options = {}) {
  const env = options.env || process.env
  const explicit = String(env?.PVTKRRX_SERVER_ADMIN_TOKEN || '').trim()
  if (explicit) {
    return {
      token: explicit,
      created: false,
      source: 'env',
      path: ''
    }
  }

  const filePath = getServerAdminTokenFilePath(runtimeDir, env)
  if (fs.existsSync(filePath)) {
    return {
      token: String(fs.readFileSync(filePath, 'utf8') || '').trim(),
      created: false,
      source: 'file',
      path: filePath
    }
  }

  if (options.createIfMissing === false) {
    return {
      token: '',
      created: false,
      source: 'missing',
      path: filePath
    }
  }

  const token = crypto.randomBytes(24).toString('base64url')
  writeTokenFile(filePath, token)
  return {
    token,
    created: true,
    source: 'generated-file',
    path: filePath
  }
}

module.exports = {
  ensureServerAdminToken,
  getServerAdminTokenFilePath
}
