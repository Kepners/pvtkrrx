const fs = require('fs')

function normalizeBaseUrl(input) {
  const text = String(input || '').trim().replace(/\/+$/, '')
  if (!text) return ''
  return text
}

class PairStore {
  constructor(options = {}) {
    this.memory = new Map()
    this.filePath = String(options.filePath || process.env.PVTKRRX_PAIR_STORE_FILE || '').trim()
    this.redisUrl = normalizeBaseUrl(
      options.redisUrl ||
      process.env.PVTKRRX_PAIR_REDIS_REST_URL ||
      process.env.KV_REST_API_URL ||
      ''
    )
    this.redisToken = String(
      options.redisToken ||
      process.env.PVTKRRX_PAIR_REDIS_REST_TOKEN ||
      process.env.KV_REST_API_TOKEN ||
      ''
    ).trim()
  }

  async set(pairId, value, ttlSeconds = 120) {
    const key = this._key(pairId)
    if (!key) return false
    const ttl = Math.max(10, Number.parseInt(String(ttlSeconds || 120), 10) || 120)
    const payload = JSON.stringify(value || {})

    if (this.redisUrl && this.redisToken) {
      const ok = await this._redisSet(key, payload, ttl)
      if (ok) return true
    }

    if (this.filePath) {
      const ok = this._fileSet(key, payload, ttl)
      if (ok) return true
    }

    this.memory.set(key, {
      value: payload,
      expiresAt: Date.now() + ttl * 1000
    })
    return true
  }

  async get(pairId) {
    const key = this._key(pairId)
    if (!key) return null

    if (this.redisUrl && this.redisToken) {
      const value = await this._redisGet(key)
      if (value !== null) {
        try { return JSON.parse(value) } catch (_) { return null }
      }
    }

    if (this.filePath) {
      const value = this._fileGet(key)
      if (value !== null) {
        try { return JSON.parse(value) } catch (_) { return null }
      }
    }

    const hit = this.memory.get(key)
    if (!hit) return null
    if (hit.expiresAt <= Date.now()) {
      this.memory.delete(key)
      return null
    }
    try { return JSON.parse(hit.value) } catch (_) { return null }
  }

  _key(pairId) {
    const id = String(pairId || '').trim()
    if (!id) return ''
    return `pair:${id}`
  }

  async _redisSet(key, value, ttlSeconds) {
    try {
      const data = await this._redisCommand(['SET', key, value, 'EX', String(ttlSeconds)])
      return data.ok
    } catch (_) {
      return false
    }
  }

  async _redisGet(key) {
    try {
      const data = await this._redisCommand(['GET', key])
      if (!data.ok) return null
      const value = data.result
      if (typeof value !== 'string') return null
      return value
    } catch (_) {
      return null
    }
  }

  async _redisCommand(parts) {
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

  _fileSet(key, value, ttlSeconds) {
    try {
      let store = {}
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8')
        store = raw.trim() ? JSON.parse(raw) : {}
      }
      if (!store || typeof store !== 'object') store = {}
      store[key] = {
        value,
        expiresAt: Date.now() + ttlSeconds * 1000
      }
      const dir = this.filePath.replace(/[\\/][^\\/]+$/, '')
      if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(this.filePath, JSON.stringify(store), 'utf8')
      return true
    } catch (_) {
      return false
    }
  }

  _fileGet(key) {
    try {
      if (!fs.existsSync(this.filePath)) return null
      const raw = fs.readFileSync(this.filePath, 'utf8')
      const store = raw.trim() ? JSON.parse(raw) : {}
      if (!store || typeof store !== 'object') return null

      const now = Date.now()
      let touched = false
      for (const [k, record] of Object.entries(store)) {
        const expiresAt = Number(record?.expiresAt || 0)
        if (expiresAt > 0 && expiresAt <= now) {
          delete store[k]
          touched = true
        }
      }
      if (touched) fs.writeFileSync(this.filePath, JSON.stringify(store), 'utf8')

      const hit = store[key]
      if (!hit || typeof hit.value !== 'string') return null
      return hit.value
    } catch (_) {
      return null
    }
  }
}

module.exports = { PairStore }
