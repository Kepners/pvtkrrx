function isSanitizedProvisionReadback(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false
  return Boolean(config.savedSecrets && typeof config.savedSecrets === 'object')
}

function shouldPersistProvisionConfig(result) {
  const config = result?.config
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false
  if (!String(config.qbitUrl || '').trim()) return false
  return !isSanitizedProvisionReadback(config)
}

module.exports = {
  isSanitizedProvisionReadback,
  shouldPersistProvisionConfig
}
