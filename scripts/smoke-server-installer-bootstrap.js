const assert = require('node:assert/strict')
const path = require('node:path')

async function run() {
  const repoRoot = path.resolve(__dirname, '..')
  const previous = process.env.PVTKRRX_SELFHOST_BOOTSTRAP_ACTIVE

  try {
    process.env.PVTKRRX_SELFHOST_BOOTSTRAP_ACTIVE = '1'
    const { runFullBootstrap } = require('./server-installer')

    assert.throws(
      () => runFullBootstrap(repoRoot),
      /already running; refusing to re-enter install-selfhost\.sh/i
    )

    console.log('Smoke server installer bootstrap guard passed')
  } finally {
    if (previous === undefined) delete process.env.PVTKRRX_SELFHOST_BOOTSTRAP_ACTIVE
    else process.env.PVTKRRX_SELFHOST_BOOTSTRAP_ACTIVE = previous
  }
}

run().catch((error) => {
  console.error('Smoke server installer bootstrap guard failed')
  console.error(error)
  process.exit(1)
})
