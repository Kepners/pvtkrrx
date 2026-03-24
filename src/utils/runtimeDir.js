const path = require('path')

function resolveRuntimeDir(env = process.env, options = {}) {
  const configured = String(env?.PVTKRRX_RUNTIME_DIR || '').trim()
  if (configured) return configured

  const platform = String(options.platform || process.platform)
  const cwd = String(options.cwd || process.cwd())
  const appData = String(env?.APPDATA || '').trim()
  if (platform === 'win32' || appData) {
    const userProfile = String(env?.USERPROFILE || '').trim()
    const baseDir = appData || path.join(userProfile || cwd, 'AppData', 'Roaming')
    return path.join(baseDir, 'PVTKRRX', 'runtime')
  }

  return path.join(cwd, '.runtime')
}

module.exports = {
  resolveRuntimeDir
}
