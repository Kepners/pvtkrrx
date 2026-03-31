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

  const homeDir = String(env?.HOME || env?.USERPROFILE || '').trim()
  if (platform === 'darwin') {
    return path.join(homeDir || cwd, 'Library', 'Application Support', 'PVTKRRX', 'runtime')
  }

  const xdgDataHome = String(env?.XDG_DATA_HOME || '').trim()
  const baseDir = xdgDataHome || path.join(homeDir || cwd, '.local', 'share')
  return path.join(baseDir, 'PVTKRRX', 'runtime')
}

module.exports = {
  resolveRuntimeDir
}
