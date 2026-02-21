const TIMEOUT_MS = 5000

class QBitClient {
  constructor(url, username, password) {
    this.url = url.replace(/\/$/, '')
    this.username = username
    this.password = password
    this.sid = null
    // Try localhost/no-auth first, then fall back to cookie auth when needed.
    this.noAuth = true
  }

  async login() {
    if (this.sid) return this.sid

    if (!this.username) {
      throw new Error('qBit requires WebUI credentials or localhost auth disabled')
    }

    if (!this.password) {
      throw new Error('qBit password is required when localhost auth is enabled')
    }

    const res = await fetch(`${this.url}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}`,
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })

    if (!res.ok) {
      if (res.status === 403) throw new Error('qBit login rejected (403). Check username/password.')
      throw new Error(`qBit login HTTP ${res.status}`)
    }

    const body = await res.text()
    if (body.trim() !== 'Ok.') throw new Error('qBit login: invalid credentials')

    const setCookie = res.headers.get('set-cookie') || ''
    const match = setCookie.match(/SID=([^;]+)/)
    if (!match) throw new Error('qBit login: no SID cookie')

    this.sid = match[1]
    return this.sid
  }

  async request(path, options = {}) {
    const method = options.method || 'GET'
    const body = options.body
    const expect = options.expect || 'json'

    const doFetch = async (withCookie) => {
      const headers = { ...(options.headers || {}) }
      if (withCookie && this.sid) headers.Cookie = `SID=${this.sid}`
      const res = await fetch(`${this.url}${path}`, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
      return res
    }

    // First attempt without auth when enabled
    if (this.noAuth) {
      const res = await doFetch(false)
      if (res.ok) return expect === 'text' ? res.text() : res.json()
      if (res.status !== 403) throw new Error(`qBit ${path} HTTP ${res.status}`)
      this.noAuth = false
    }

    await this.login()
    let res = await doFetch(true)
    if (res.status === 403) {
      // Retry without auth in case localhost auth is disabled but cookie flow failed.
      res = await doFetch(false)
      if (res.ok) {
        this.noAuth = true
        return expect === 'text' ? res.text() : res.json()
      }
    }
    if (!res.ok) throw new Error(`qBit ${path} HTTP ${res.status}`)
    return expect === 'text' ? res.text() : res.json()
  }

  async torrents(filter = 'completed') {
    return this.request(`/api/v2/torrents/info?filter=${encodeURIComponent(filter)}`)
  }

  async torrentsByHashes(hashes, filter = 'all') {
    const value = Array.isArray(hashes) ? hashes.join('|') : String(hashes || '')
    return this.request(
      `/api/v2/torrents/info?filter=${encodeURIComponent(filter)}&hashes=${encodeURIComponent(value)}`
    )
  }

  async toggleSequentialDownload(hashes) {
    const value = Array.isArray(hashes) ? hashes.join('|') : String(hashes || '')
    return this.request('/api/v2/torrents/toggleSequentialDownload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `hashes=${encodeURIComponent(value)}`,
      expect: 'text'
    })
  }

  async toggleFirstLastPiecePrio(hashes) {
    const value = Array.isArray(hashes) ? hashes.join('|') : String(hashes || '')
    return this.request('/api/v2/torrents/toggleFirstLastPiecePrio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `hashes=${encodeURIComponent(value)}`,
      expect: 'text'
    })
  }

  async setFilePriority(hash, fileIds, priority = 7) {
    const ids = Array.isArray(fileIds) ? fileIds.join('|') : String(fileIds || '')
    return this.request('/api/v2/torrents/filePrio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `hash=${encodeURIComponent(hash)}&id=${encodeURIComponent(ids)}&priority=${encodeURIComponent(String(priority))}`,
      expect: 'text'
    })
  }

  async files(hash) {
    return this.request(`/api/v2/torrents/files?hash=${encodeURIComponent(hash)}`)
  }

  async add(magnetOrUrl) {
    return this.request('/api/v2/torrents/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `urls=${encodeURIComponent(magnetOrUrl)}`,
      expect: 'text'
    })
  }

  async preferences() {
    return this.request('/api/v2/app/preferences')
  }

  async setPreferences(prefs) {
    const json = JSON.stringify(prefs || {})
    return this.request('/api/v2/app/setPreferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `json=${encodeURIComponent(json)}`,
      expect: 'text'
    })
  }
}

module.exports = { QBitClient }
