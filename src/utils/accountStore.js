const fs = require('fs')
const crypto = require('crypto')

function normalizeBaseUrl(input) {
  const text = String(input || '').trim().replace(/\/+$/, '')
  if (!text) return ''
  return text
}

function normalizeAccountEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function hashAccountEmail(email) {
  return crypto
    .createHash('sha256')
    .update(normalizeAccountEmail(email))
    .digest('hex')
}

function normalizeStremioUserId(userId) {
  const raw = String(userId || '').trim()
  if (!raw) return ''
  if (raw.length > 256) return ''
  return raw
}

function hashStremioAuthKey(authKey) {
  return crypto
    .createHash('sha256')
    .update(String(authKey || '').trim())
    .digest('hex')
}

function buildSyntheticEmail(stremioUserId) {
  const digest = crypto
    .createHash('sha256')
    .update(String(stremioUserId || ''))
    .digest('hex')
    .slice(0, 24)
  return `stremio-${digest}@pvtkrrx.local`
}

function makeUserId() {
  return `usr_${crypto.randomBytes(12).toString('base64url')}`
}

class AccountStore {
  constructor(options = {}) {
    this.memory = new Map()
    this.filePath = String(options.filePath || process.env.PVTKRRX_ACCOUNT_STORE_FILE || '').trim()
    this.redisUrl = normalizeBaseUrl(
      options.redisUrl ||
      process.env.PVTKRRX_ACCOUNT_REDIS_REST_URL ||
      process.env.KV_REST_API_URL ||
      ''
    )
    this.redisToken = String(
      options.redisToken ||
      process.env.PVTKRRX_ACCOUNT_REDIS_REST_TOKEN ||
      process.env.KV_REST_API_TOKEN ||
      ''
    ).trim()
  }

  userKey(userId) {
    return `acct:user:${String(userId || '').trim()}`
  }

  emailKey(emailHash) {
    return `acct:email:${String(emailHash || '').trim()}`
  }

  stripeCustomerKey(customerId) {
    return `acct:stripe_customer:${String(customerId || '').trim()}`
  }

  stripeSubscriptionKey(subscriptionId) {
    return `acct:stripe_subscription:${String(subscriptionId || '').trim()}`
  }

  stremioUserKey(stremioUserId) {
    return `acct:stremio_user:${String(stremioUserId || '').trim()}`
  }

  async createUser(input = {}) {
    const email = normalizeAccountEmail(input.email)
    const emailHash = hashAccountEmail(email)
    if (!email || !email.includes('@')) {
      throw new Error('Invalid email')
    }
    if (!input.passwordHash) {
      throw new Error('Password hash is required')
    }

    const existing = await this.getUserByEmail(email)
    if (existing) return null

    const now = Date.now()
    const user = {
      id: makeUserId(),
      email,
      emailHash,
      passwordHash: String(input.passwordHash),
      createdAt: now,
      updatedAt: now,
      billing: {
        status: 'inactive',
        customerId: '',
        subscriptionId: '',
        priceId: '',
        currentPeriodEndMs: 0,
        cancelAtPeriodEnd: false,
        updatedAt: now
      }
    }

    await this.set(this.emailKey(emailHash), user.id)
    await this.set(this.userKey(user.id), JSON.stringify(user))
    return user
  }

  async getUserById(userId) {
    const id = String(userId || '').trim()
    if (!id) return null
    const raw = await this.get(this.userKey(id))
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return null
      return parsed
    } catch (_) {
      return null
    }
  }

  async getUserByEmail(email) {
    const normalized = normalizeAccountEmail(email)
    if (!normalized) return null
    const userId = await this.get(this.emailKey(hashAccountEmail(normalized)))
    if (!userId) return null
    return this.getUserById(userId)
  }

  async getUserByStripeCustomerId(customerId) {
    const id = String(customerId || '').trim()
    if (!id) return null
    const userId = await this.get(this.stripeCustomerKey(id))
    if (!userId) return null
    return this.getUserById(userId)
  }

  async getUserByStripeSubscriptionId(subscriptionId) {
    const id = String(subscriptionId || '').trim()
    if (!id) return null
    const userId = await this.get(this.stripeSubscriptionKey(id))
    if (!userId) return null
    return this.getUserById(userId)
  }

  async getUserByStremioUserId(stremioUserId) {
    const id = normalizeStremioUserId(stremioUserId)
    if (!id) return null
    const userId = await this.get(this.stremioUserKey(id))
    if (!userId) return null
    return this.getUserById(userId)
  }

  async createOrLinkStremioUser(input = {}) {
    const stremioUserId = normalizeStremioUserId(input.stremioUserId)
    if (!stremioUserId) throw new Error('stremioUserId is required')

    const providedEmail = normalizeAccountEmail(input.email)
    const email = providedEmail && providedEmail.includes('@')
      ? providedEmail
      : buildSyntheticEmail(stremioUserId)
    const now = Date.now()
    const authKeyHash = String(input.authKeyHash || '').trim()

    const existing = await this.getUserByStremioUserId(stremioUserId)
    if (existing) {
      const next = {
        ...existing,
        email: existing.email || email,
        stremio: {
          ...(existing.stremio && typeof existing.stremio === 'object' ? existing.stremio : {}),
          userId: stremioUserId,
          authKeyHash: authKeyHash || String(existing?.stremio?.authKeyHash || ''),
          linkedAt: Number(existing?.stremio?.linkedAt || now),
          lastVerifiedAt: now
        }
      }
      return this.saveUser(next)
    }

    const user = {
      id: makeUserId(),
      email,
      emailHash: hashAccountEmail(email),
      passwordHash: '',
      authProvider: 'stremio',
      createdAt: now,
      updatedAt: now,
      stremio: {
        userId: stremioUserId,
        authKeyHash,
        linkedAt: now,
        lastVerifiedAt: now
      },
      billing: {
        status: 'inactive',
        customerId: '',
        subscriptionId: '',
        priceId: '',
        currentPeriodEndMs: 0,
        cancelAtPeriodEnd: false,
        updatedAt: now
      }
    }

    await this.set(this.userKey(user.id), JSON.stringify(user))
    await this.set(this.emailKey(user.emailHash), user.id)
    await this.set(this.stremioUserKey(stremioUserId), user.id)
    return user
  }

  async saveUser(user) {
    if (!user || typeof user !== 'object') throw new Error('Invalid user payload')
    const id = String(user.id || '').trim()
    const email = normalizeAccountEmail(user.email)
    if (!id || !email) throw new Error('User id/email missing')

    const next = {
      ...user,
      email,
      emailHash: hashAccountEmail(email),
      updatedAt: Date.now()
    }
    if (!next.billing || typeof next.billing !== 'object') {
      next.billing = {
        status: 'inactive',
        customerId: '',
        subscriptionId: '',
        priceId: '',
        currentPeriodEndMs: 0,
        cancelAtPeriodEnd: false,
        updatedAt: Date.now()
      }
    } else {
      next.billing = {
        status: String(next.billing.status || 'inactive'),
        customerId: String(next.billing.customerId || ''),
        subscriptionId: String(next.billing.subscriptionId || ''),
        priceId: String(next.billing.priceId || ''),
        currentPeriodEndMs: Number(next.billing.currentPeriodEndMs || 0),
        cancelAtPeriodEnd: Boolean(next.billing.cancelAtPeriodEnd),
        updatedAt: Date.now()
      }
    }

    await this.set(this.userKey(id), JSON.stringify(next))
    await this.set(this.emailKey(next.emailHash), id)

    if (next.billing.customerId) {
      await this.set(this.stripeCustomerKey(next.billing.customerId), id)
    }
    if (next.billing.subscriptionId) {
      await this.set(this.stripeSubscriptionKey(next.billing.subscriptionId), id)
    }
    const stremioUserId = normalizeStremioUserId(next?.stremio?.userId)
    if (stremioUserId) {
      await this.set(this.stremioUserKey(stremioUserId), id)
    }

    return next
  }

  async get(key) {
    if (!key) return null

    if (this.redisUrl && this.redisToken) {
      const value = await this.redisGet(key)
      if (value !== null) return value
    }

    if (this.filePath) {
      const value = this.fileGet(key)
      if (value !== null) return value
    }

    if (!this.memory.has(key)) return null
    return this.memory.get(key)
  }

  async set(key, value) {
    if (!key) return false
    const serialized = String(value ?? '')

    if (this.redisUrl && this.redisToken) {
      const ok = await this.redisSet(key, serialized)
      if (ok) return true
    }

    if (this.filePath) {
      const ok = this.fileSet(key, serialized)
      if (ok) return true
    }

    this.memory.set(key, serialized)
    return true
  }

  async redisSet(key, value) {
    try {
      const data = await this.redisCommand(['SET', key, value])
      return data.ok
    } catch (_) {
      return false
    }
  }

  async redisGet(key) {
    try {
      const data = await this.redisCommand(['GET', key])
      if (!data.ok) return null
      if (typeof data.result !== 'string') return null
      return data.result
    } catch (_) {
      return null
    }
  }

  async redisCommand(parts) {
    const res = await fetch(this.redisUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.redisToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(parts),
      signal: AbortSignal.timeout(2500)
    })
    if (!res.ok) return { ok: false, result: null }
    const data = await res.json().catch(() => null)
    if (!data || typeof data !== 'object') return { ok: false, result: null }
    if (data.error) return { ok: false, result: null }
    return { ok: true, result: data.result }
  }

  fileSet(key, value) {
    try {
      const store = this.fileLoad()
      store[key] = String(value ?? '')
      this.fileSave(store)
      return true
    } catch (_) {
      return false
    }
  }

  fileGet(key) {
    try {
      const store = this.fileLoad()
      if (!Object.prototype.hasOwnProperty.call(store, key)) return null
      const value = store[key]
      if (typeof value !== 'string') return null
      return value
    } catch (_) {
      return null
    }
  }

  fileLoad() {
    if (!this.filePath || !fs.existsSync(this.filePath)) return {}
    const raw = fs.readFileSync(this.filePath, 'utf8')
    const parsed = raw.trim() ? JSON.parse(raw) : {}
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed
  }

  fileSave(store) {
    const dir = this.filePath.replace(/[\\/][^\\/]+$/, '')
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(this.filePath, JSON.stringify(store), 'utf8')
  }
}

module.exports = {
  AccountStore,
  normalizeAccountEmail,
  hashAccountEmail,
  normalizeStremioUserId,
  hashStremioAuthKey
}
