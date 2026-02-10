const TIMEOUT_MS = 5000

class QBitClient {
  constructor(url, username, password) {
    this.url = url.replace(/\/$/, '')
    this.username = username
    this.password = password
    this.sid = null
  }

  async login() {
    if (this.sid) return this.sid

    const res = await fetch(`${this.url}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}`,
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })

    if (!res.ok) throw new Error(`qBit login HTTP ${res.status}`)

    const body = await res.text()
    if (body.trim() !== 'Ok.') throw new Error('qBit login: invalid credentials')

    const setCookie = res.headers.get('set-cookie') || ''
    const match = setCookie.match(/SID=([^;]+)/)
    if (!match) throw new Error('qBit login: no SID cookie')

    this.sid = match[1]
    return this.sid
  }

  async torrents(filter = 'completed') {
    const sid = await this.login()
    const res = await fetch(`${this.url}/api/v2/torrents/info?filter=${filter}`, {
      headers: { Cookie: `SID=${sid}` },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!res.ok) throw new Error(`qBit torrents HTTP ${res.status}`)
    return res.json()
  }

  async files(hash) {
    const sid = await this.login()
    const res = await fetch(`${this.url}/api/v2/torrents/files?hash=${hash}`, {
      headers: { Cookie: `SID=${sid}` },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!res.ok) throw new Error(`qBit files HTTP ${res.status}`)
    return res.json()
  }

  async add(magnetOrUrl) {
    const sid = await this.login()
    const res = await fetch(`${this.url}/api/v2/torrents/add`, {
      method: 'POST',
      headers: {
        Cookie: `SID=${sid}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `urls=${encodeURIComponent(magnetOrUrl)}`,
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!res.ok) throw new Error(`qBit add HTTP ${res.status}`)
    return res.text()
  }
}

module.exports = { QBitClient }
