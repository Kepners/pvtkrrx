const { XMLParser } = require('fast-xml-parser')

const TIMEOUT_MS = 7000
const SERVER_TIMEOUT = 6

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'item' || name === 'torznab:attr'
})

class TorznabClient {
  constructor(url, apiKey) {
    this.url = url.replace(/\/$/, '')
    this.apiKey = apiKey
  }

  _buildUrl(params) {
    const u = new URL(`${this.url}/api`)
    u.searchParams.set('apikey', this.apiKey)
    for (const [key, value] of Object.entries(params)) {
      u.searchParams.set(key, String(value))
    }
    return u.toString()
  }

  async _fetch(params) {
    const url = this._buildUrl(params)
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) throw new Error(`Torznab HTTP ${res.status}`)
    const xml = await res.text()
    return parser.parse(xml)
  }

  _parseItems(parsed) {
    const channel = parsed?.rss?.channel
    if (!channel) return []
    const items = channel.item || []
    return items.map(item => {
      const attrs = {}
      const torznabAttrs = item['torznab:attr'] || []
      for (const attr of torznabAttrs) {
        attrs[attr['@_name']] = attr['@_value']
      }
      return {
        title: String(item.title || ''),
        link: String(item.link || ''),
        size: parseInt(attrs.size || item.size || '0', 10),
        seeders: parseInt(attrs.seeders || '0', 10),
        infohash: (attrs.infohash || '').toLowerCase(),
        imdbId: String(attrs.imdbid || attrs.imdb || ''),
        category: String(attrs.category || ''),
        pubDate: String(item.pubDate || '')
      }
    })
  }

  async search(query, cats) {
    const parsed = await this._fetch({ t: 'search', q: query, cat: cats, timeout: SERVER_TIMEOUT })
    return this._parseItems(parsed)
  }

  async searchImdb(imdbId, cats, type = 'movie') {
    const t = type === 'series' ? 'tvsearch' : 'movie'
    const parsed = await this._fetch({ t, imdbid: imdbId, cat: cats, timeout: SERVER_TIMEOUT })
    return this._parseItems(parsed)
  }

  async rss(cats) {
    const parsed = await this._fetch({ t: 'search', cat: cats, timeout: SERVER_TIMEOUT })
    return this._parseItems(parsed)
  }

  async caps() {
    const parsed = await this._fetch({ t: 'caps' })
    return parsed
  }
}

module.exports = { TorznabClient }
