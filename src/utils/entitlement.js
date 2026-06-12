'use strict'

const crypto = require('crypto')
const {
  SPORTS_POSTER_TEMPLATES,
  normalizeSportsPosterTemplate
} = require('./sportsPosterTemplates')

const FREE_SPORTS_POSTER_TEMPLATE = 'ticket-stub'

// Sentinel hash stamped on the config when entitlement was granted via the
// self-host admin token (no email available). The runtime verify accepts it
// only when PVTKRRX_SELF_HOST_MODE is on, so a leaked self-host token cannot
// be replayed against a non-self-host runtime.
const SELF_HOST_ADMIN_HASH = 'self-host-admin'
const SPORTS_POSTER_ENTITLEMENT_STAMP_VERSION = 'v1'
const SPORTS_POSTER_ENTITLEMENT_QUERY_PARAMS = new Set([
  'reqTemplate',
  'entSource',
  'entHash',
  'entSig'
])

const ENTITLEMENT_SOURCE = Object.freeze({
  OWNER_OVERRIDE: 'owner_override',
  ADMIN_OVERRIDE: 'admin_override',
  MANUAL_GRANT: 'manual_grant',
  MEMBER_TOKEN: 'member_token',
  TRIAL: 'trial',
  NONE: 'none'
})

const ALL_ENTITLEMENT_SOURCES = Object.freeze(Object.values(ENTITLEMENT_SOURCE))

const VALID_TEMPLATES = new Set(SPORTS_POSTER_TEMPLATES)

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function hashEmailForOwnerCheck(value) {
  const normalized = normalizeEmail(value)
  if (!normalized) return ''
  return crypto.createHash('sha256').update(normalized).digest('hex')
}

function parseEmailList(value) {
  const out = new Set()
  for (const part of String(value || '').split(/[,;\s]+/)) {
    const email = normalizeEmail(part)
    if (email && email.includes('@')) out.add(email)
  }
  return out
}

function parseStremioUserIdList(value) {
  const out = new Set()
  for (const part of String(value || '').split(/[,;\s]+/)) {
    const id = String(part || '').trim()
    if (id) out.add(id)
  }
  return out
}

function getOwnerEmails(env = process.env) {
  return parseEmailList(env.PVTKRRX_OWNER_EMAILS || env.OWNER_EMAILS || '')
}

function getAdminEmails(env = process.env) {
  return parseEmailList(env.PVTKRRX_ADMIN_EMAILS || env.ADMIN_EMAILS || '')
}

function getOwnerStremioUserIds(env = process.env) {
  return parseStremioUserIdList(env.PVTKRRX_OWNER_STREMIO_USER_IDS || '')
}

function getAdminStremioUserIds(env = process.env) {
  return parseStremioUserIdList(env.PVTKRRX_ADMIN_STREMIO_USER_IDS || '')
}

function isOwnerEmail(email, env = process.env) {
  const normalized = normalizeEmail(email)
  if (!normalized) return false
  return getOwnerEmails(env).has(normalized)
}

function isAdminEmail(email, env = process.env) {
  const normalized = normalizeEmail(email)
  if (!normalized) return false
  return getAdminEmails(env).has(normalized)
}

function isOwnerStremioUserId(id, env = process.env) {
  const trimmed = String(id || '').trim()
  if (!trimmed) return false
  return getOwnerStremioUserIds(env).has(trimmed)
}

function isAdminStremioUserId(id, env = process.env) {
  const trimmed = String(id || '').trim()
  if (!trimmed) return false
  return getAdminStremioUserIds(env).has(trimmed)
}

function getEntitlementGrantsFromUser(user) {
  if (!user || typeof user !== 'object') return null
  const grants = user.entitlements && typeof user.entitlements === 'object'
    ? user.entitlements
    : null
  if (!grants) return null
  const sports = Array.isArray(grants.sportsPosterTemplates)
    ? grants.sportsPosterTemplates
        .map((t) => normalizeSportsPosterTemplate(t))
        .filter((t) => VALID_TEMPLATES.has(t))
    : null
  if (!sports || !sports.length) return null
  return { sportsPosterTemplates: Array.from(new Set(sports)) }
}

/**
 * Resolve sports-poster entitlement at SAVE time.
 *
 * Precedence (matches docs/SALES_SPEC.md and the audit brief):
 *   1. Owner override     (env-listed email or stremio userId)
 *   2. Admin override     (env-listed email or stremio userId)
 *   3. Explicit manual grant on the account record
 *   4. Member token present on config (deferred verification)
 *   5. Active trial flag on the account
 *   6. None — only the free `ticket-stub` template
 *
 * Returns:
 *   {
 *     allowed: boolean,
 *     source: ENTITLEMENT_SOURCE.*,
 *     allowedTemplates: string[],
 *     resolvedTemplate: string,    // the template that should be persisted
 *     ownerEmailHash: string       // sha256(email) when owner/admin, '' otherwise
 *   }
 */
function resolveSportsPosterEntitlement(input = {}) {
  const env = input.env && typeof input.env === 'object' ? input.env : process.env
  const user = input.user && typeof input.user === 'object' ? input.user : null
  const config = input.config && typeof input.config === 'object' ? input.config : {}
  const requestedRaw = String(input.requestedTemplate || config.sportsPosterTemplate || '').trim()
  const requested = requestedRaw ? normalizeSportsPosterTemplate(requestedRaw) : ''

  const userEmail = normalizeEmail(user?.email || input.email || '')
  const stremioUserId = String(
    user?.stremio?.userId || config.stremioUserId || input.stremioUserId || ''
  ).trim()
  const memberToken = String(config.sportsPosterMemberToken || '').trim()
  const trialActive = Boolean(user?.trial?.active)
  const selfHostAdmin = input.selfHostAdmin === true

  if (selfHostAdmin) {
    return finaliseEntitlement({
      source: ENTITLEMENT_SOURCE.ADMIN_OVERRIDE,
      allowedTemplates: SPORTS_POSTER_TEMPLATES.slice(),
      requested,
      ownerEmailHash: userEmail ? hashEmailForOwnerCheck(userEmail) : SELF_HOST_ADMIN_HASH
    })
  }

  if (userEmail && isOwnerEmail(userEmail, env)) {
    return finaliseEntitlement({
      source: ENTITLEMENT_SOURCE.OWNER_OVERRIDE,
      allowedTemplates: SPORTS_POSTER_TEMPLATES.slice(),
      requested,
      ownerEmailHash: hashEmailForOwnerCheck(userEmail)
    })
  }
  if (stremioUserId && isOwnerStremioUserId(stremioUserId, env)) {
    return finaliseEntitlement({
      source: ENTITLEMENT_SOURCE.OWNER_OVERRIDE,
      allowedTemplates: SPORTS_POSTER_TEMPLATES.slice(),
      requested,
      ownerEmailHash: userEmail ? hashEmailForOwnerCheck(userEmail) : ''
    })
  }

  if (userEmail && isAdminEmail(userEmail, env)) {
    return finaliseEntitlement({
      source: ENTITLEMENT_SOURCE.ADMIN_OVERRIDE,
      allowedTemplates: SPORTS_POSTER_TEMPLATES.slice(),
      requested,
      ownerEmailHash: hashEmailForOwnerCheck(userEmail)
    })
  }
  if (stremioUserId && isAdminStremioUserId(stremioUserId, env)) {
    return finaliseEntitlement({
      source: ENTITLEMENT_SOURCE.ADMIN_OVERRIDE,
      allowedTemplates: SPORTS_POSTER_TEMPLATES.slice(),
      requested,
      ownerEmailHash: userEmail ? hashEmailForOwnerCheck(userEmail) : ''
    })
  }

  const grants = getEntitlementGrantsFromUser(user)
  if (grants) {
    return finaliseEntitlement({
      source: ENTITLEMENT_SOURCE.MANUAL_GRANT,
      allowedTemplates: grants.sportsPosterTemplates,
      requested
    })
  }

  if (memberToken) {
    return finaliseEntitlement({
      source: ENTITLEMENT_SOURCE.MEMBER_TOKEN,
      allowedTemplates: SPORTS_POSTER_TEMPLATES.slice(),
      requested
    })
  }

  if (trialActive) {
    return finaliseEntitlement({
      source: ENTITLEMENT_SOURCE.TRIAL,
      allowedTemplates: SPORTS_POSTER_TEMPLATES.slice(),
      requested
    })
  }

  return finaliseEntitlement({
    source: ENTITLEMENT_SOURCE.NONE,
    allowedTemplates: [FREE_SPORTS_POSTER_TEMPLATE],
    requested
  })
}

function finaliseEntitlement({ source, allowedTemplates, requested, ownerEmailHash = '' }) {
  const allowed = Array.isArray(allowedTemplates) && allowedTemplates.length
    ? allowedTemplates.filter((t) => VALID_TEMPLATES.has(t))
    : [FREE_SPORTS_POSTER_TEMPLATE]
  const set = new Set(allowed)
  if (!set.has(FREE_SPORTS_POSTER_TEMPLATE)) {
    set.add(FREE_SPORTS_POSTER_TEMPLATE)
    allowed.push(FREE_SPORTS_POSTER_TEMPLATE)
  }
  const resolved = requested && set.has(requested)
    ? requested
    : FREE_SPORTS_POSTER_TEMPLATE
  return {
    allowed: source !== ENTITLEMENT_SOURCE.NONE,
    source,
    allowedTemplates: Array.from(new Set(allowed)),
    resolvedTemplate: resolved,
    ownerEmailHash
  }
}

/**
 * Re-verify an entitlement that was already STAMPED on a config token.
 * Used at runtime when we don't have the original user record but only
 * the decrypted config. Owner/admin sources are revoked instantly when
 * the env owners list changes; other sources trust the stamp until the
 * token is regenerated (their revocation requires async accountStore
 * lookup).
 */
function verifyStampedSportsPosterEntitlement(input = {}) {
  const env = input.env && typeof input.env === 'object' ? input.env : process.env
  const requested = String(input.requestedTemplate || '').trim()
    ? normalizeSportsPosterTemplate(input.requestedTemplate)
    : ''
  const stampedSource = String(input.stampedSource || '').trim()
  const stampedHash = String(input.stampedHash || '').trim()

  if (stampedSource === ENTITLEMENT_SOURCE.OWNER_OVERRIDE) {
    if (stampedHash && envOwnerHashes(env).has(stampedHash)) {
      return finaliseEntitlement({
        source: ENTITLEMENT_SOURCE.OWNER_OVERRIDE,
        allowedTemplates: SPORTS_POSTER_TEMPLATES.slice(),
        requested,
        ownerEmailHash: stampedHash
      })
    }
    return finaliseEntitlement({
      source: ENTITLEMENT_SOURCE.NONE,
      allowedTemplates: [FREE_SPORTS_POSTER_TEMPLATE],
      requested
    })
  }

  if (stampedSource === ENTITLEMENT_SOURCE.ADMIN_OVERRIDE) {
    const selfHostMode = isSelfHostModeEnabled(env)
    const adminHashes = envAdminHashes(env)
    const isSelfHostAdminStamp = stampedHash === SELF_HOST_ADMIN_HASH
    if (
      (stampedHash && adminHashes.has(stampedHash)) ||
      (selfHostMode && isSelfHostAdminStamp)
    ) {
      return finaliseEntitlement({
        source: ENTITLEMENT_SOURCE.ADMIN_OVERRIDE,
        allowedTemplates: SPORTS_POSTER_TEMPLATES.slice(),
        requested,
        ownerEmailHash: stampedHash
      })
    }
    return finaliseEntitlement({
      source: ENTITLEMENT_SOURCE.NONE,
      allowedTemplates: [FREE_SPORTS_POSTER_TEMPLATE],
      requested
    })
  }

  if (
    stampedSource === ENTITLEMENT_SOURCE.MANUAL_GRANT ||
    stampedSource === ENTITLEMENT_SOURCE.MEMBER_TOKEN ||
    stampedSource === ENTITLEMENT_SOURCE.TRIAL
  ) {
    return finaliseEntitlement({
      source: stampedSource,
      allowedTemplates: SPORTS_POSTER_TEMPLATES.slice(),
      requested
    })
  }

  return finaliseEntitlement({
    source: ENTITLEMENT_SOURCE.NONE,
    allowedTemplates: [FREE_SPORTS_POSTER_TEMPLATE],
    requested
  })
}

function isSelfHostModeEnabled(env = process.env) {
  return /^(1|true|yes|on)$/i.test(String(env.PVTKRRX_SELF_HOST_MODE || '').trim())
}

// Server-side admin poster-style override.
//
// This is the OPERATOR's deliberate, server-wide choice — set via a server
// env var the configure page surfaces as "Server-side admin override active".
// It is NOT a per-user config token, so honouring it on the public artwork
// proxy does not weaken the anti-leak protection (that protection exists to
// stop a *leaked user URL* from unlocking premium styles; it has no bearing
// on what the server operator chose to render for everyone).
//
// Returns a valid normalized template, or '' when no/invalid override set.
function resolveServerAdminPosterTemplate(env = process.env) {
  const raw = String(
    env.PVTKRRX_SPORTS_POSTER_ADMIN_OVERRIDE ||
    env.PVTKRRX_SPORTS_POSTER_TEMPLATE ||
    ''
  ).trim()
  if (!raw) return ''
  const normalized = normalizeSportsPosterTemplate(raw)
  return VALID_TEMPLATES.has(normalized) ? normalized : ''
}

function envOwnerHashes(env = process.env) {
  const out = new Set()
  for (const email of getOwnerEmails(env)) {
    const hash = hashEmailForOwnerCheck(email)
    if (hash) out.add(hash)
  }
  return out
}

function envAdminHashes(env = process.env) {
  const out = new Set()
  for (const email of getAdminEmails(env)) {
    const hash = hashEmailForOwnerCheck(email)
    if (hash) out.add(hash)
  }
  return out
}

function clampSportsPosterTemplate(requested, entitlement) {
  if (!entitlement || typeof entitlement !== 'object') return FREE_SPORTS_POSTER_TEMPLATE
  const candidate = String(requested || entitlement.resolvedTemplate || '').trim()
  if (!candidate) return entitlement.resolvedTemplate || FREE_SPORTS_POSTER_TEMPLATE
  const normalized = normalizeSportsPosterTemplate(candidate)
  const allowed = new Set(entitlement.allowedTemplates || [FREE_SPORTS_POSTER_TEMPLATE])
  return allowed.has(normalized) ? normalized : FREE_SPORTS_POSTER_TEMPLATE
}

function getSportsPosterEntitlementStampSecret(env = process.env) {
  return String(
    env.PVTKRRX_SPORTS_POSTER_ENTITLEMENT_SECRET ||
    env.ENCRYPTION_SECRET ||
    ''
  ).trim()
}

function normalizeArtworkStampPath(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    return new URL(raw, 'https://pvtkrrx.local').pathname || ''
  } catch (_) {
    return raw.split('?')[0] || ''
  }
}

function queryEntriesForSportsPosterEntitlementStamp(query) {
  const entries = []
  const push = (key, value) => {
    const name = String(key || '')
    if (!name || SPORTS_POSTER_ENTITLEMENT_QUERY_PARAMS.has(name) || name === 'v') return
    if (Array.isArray(value)) {
      value.forEach((item) => push(name, item))
      return
    }
    if (value === undefined || value === null) return
    entries.push([name, String(value)])
  }

  if (query instanceof URLSearchParams) {
    for (const [key, value] of query.entries()) push(key, value)
  } else if (query && typeof query === 'object') {
    for (const [key, value] of Object.entries(query)) push(key, value)
  }

  return entries.sort((a, b) => {
    if (a[0] === b[0]) return a[1].localeCompare(b[1])
    return a[0].localeCompare(b[0])
  })
}

function canonicalSportsPosterEntitlementStampQuery(query) {
  return queryEntriesForSportsPosterEntitlementStamp(query)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
}

function sportsPosterEntitlementStampPayload(input = {}) {
  const requestedTemplate = String(input.requestedTemplate || '').trim()
    ? normalizeSportsPosterTemplate(input.requestedTemplate)
    : ''
  return [
    'pvtkrrx-sports-poster-entitlement',
    SPORTS_POSTER_ENTITLEMENT_STAMP_VERSION,
    normalizeArtworkStampPath(input.pathname || input.path || ''),
    canonicalSportsPosterEntitlementStampQuery(input.query),
    requestedTemplate,
    String(input.stampedSource || '').trim(),
    String(input.stampedHash || '').trim()
  ].join('\n')
}

function signSportsPosterEntitlementStamp(input = {}) {
  const secret = getSportsPosterEntitlementStampSecret(input.env && typeof input.env === 'object' ? input.env : process.env)
  if (!secret) return ''
  return crypto
    .createHmac('sha256', secret)
    .update(sportsPosterEntitlementStampPayload(input))
    .digest('hex')
}

function verifySportsPosterEntitlementStamp(input = {}) {
  const expected = signSportsPosterEntitlementStamp(input)
  const actual = String(input.signature || '').trim()
  if (!expected || !/^[a-f0-9]{64}$/i.test(actual)) return false
  try {
    const expectedBuffer = Buffer.from(expected, 'hex')
    const actualBuffer = Buffer.from(actual, 'hex')
    return expectedBuffer.length === actualBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  } catch (_) {
    return false
  }
}

module.exports = {
  ENTITLEMENT_SOURCE,
  ALL_ENTITLEMENT_SOURCES,
  FREE_SPORTS_POSTER_TEMPLATE,
  SELF_HOST_ADMIN_HASH,
  SPORTS_POSTER_ENTITLEMENT_STAMP_VERSION,
  isSelfHostModeEnabled,
  hashEmailForOwnerCheck,
  parseEmailList,
  parseStremioUserIdList,
  getOwnerEmails,
  getAdminEmails,
  getOwnerStremioUserIds,
  getAdminStremioUserIds,
  isOwnerEmail,
  isAdminEmail,
  isOwnerStremioUserId,
  isAdminStremioUserId,
  resolveSportsPosterEntitlement,
  verifyStampedSportsPosterEntitlement,
  resolveServerAdminPosterTemplate,
  clampSportsPosterTemplate,
  signSportsPosterEntitlementStamp,
  verifySportsPosterEntitlementStamp
}
