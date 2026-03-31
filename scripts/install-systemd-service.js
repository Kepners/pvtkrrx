const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync, spawnSync } = require('child_process')

function commandExists(command) {
  const probe = process.platform === 'win32'
    ? spawnSync('where', [command], { stdio: 'ignore' })
    : spawnSync('which', [command], { stdio: 'ignore' })
  return probe.status === 0
}

function runAsRoot(command, args, options = {}) {
  const execOptions = {
    stdio: options.stdio || 'inherit',
    cwd: options.cwd || process.cwd()
  }

  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    execFileSync(command, args, execOptions)
    return
  }

  if (!commandExists('sudo')) {
    throw new Error(`Root access is required to run ${command}. Re-run this command with sudo.`)
  }

  execFileSync('sudo', [command, ...args], execOptions)
}

function buildServiceFile(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..'))
  const serviceName = String(options.serviceName || 'pvtkrrx').trim() || 'pvtkrrx'
  const nodePath = String(options.nodePath || process.execPath).trim() || process.execPath
  const user = String(
    options.user ||
    process.env.SUDO_USER ||
    process.env.USER ||
    os.userInfo().username
  ).trim()
  const envFile = String(options.envFile || path.join(repoRoot, '.env')).trim()

  return `[Unit]
Description=PVTKRRX self-hosted server (${serviceName})
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${repoRoot}
Environment=NODE_ENV=production
EnvironmentFile=-${envFile}
ExecStart=${nodePath} ${path.join(repoRoot, 'index.js')}
Restart=always
RestartSec=5
KillSignal=SIGINT
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
`
}

function installSystemdService(options = {}) {
  if (process.platform !== 'linux') {
    throw new Error('systemd installation is only supported on Linux hosts')
  }
  if (!commandExists('systemctl')) {
    throw new Error('systemctl is not available on this host')
  }

  const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..'))
  const serviceName = String(options.serviceName || 'pvtkrrx').trim() || 'pvtkrrx'
  const unitPath = `/etc/systemd/system/${serviceName}.service`
  const tempPath = path.join(os.tmpdir(), `${serviceName}.service`)
  const fileBody = buildServiceFile({
    ...options,
    repoRoot,
    serviceName
  })

  fs.writeFileSync(tempPath, fileBody, 'utf8')
  try {
    runAsRoot('install', ['-m', '0644', tempPath, unitPath], { cwd: repoRoot })
    runAsRoot('systemctl', ['daemon-reload'], { cwd: repoRoot })
    runAsRoot('systemctl', ['enable', `${serviceName}.service`], { cwd: repoRoot })
    if (options.startNow !== false) {
      runAsRoot('systemctl', ['restart', `${serviceName}.service`], { cwd: repoRoot })
    }
  } finally {
    try {
      fs.unlinkSync(tempPath)
    } catch (_) {}
  }

  return {
    serviceName,
    unitPath,
    user: String(
      options.user ||
      process.env.SUDO_USER ||
      process.env.USER ||
      os.userInfo().username
    ).trim(),
    nodePath: String(options.nodePath || process.execPath).trim() || process.execPath
  }
}

if (require.main === module) {
  try {
    const result = installSystemdService()
    console.log(`Installed ${result.serviceName}.service at ${result.unitPath}`)
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}

module.exports = {
  buildServiceFile,
  installSystemdService
}
