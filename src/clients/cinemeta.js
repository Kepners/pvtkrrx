const BASE_URL = 'https://v3-cinemeta.strem.io'
const TIMEOUT_MS = 3000

class CinemetaClient {
  async getMovie(imdbId) {
    return this._getMeta('movie', imdbId)
  }

  async getSeries(imdbId) {
    return this._getMeta('series', imdbId)
  }

  async _getMeta(type, imdbId) {
    const res = await fetch(`${BASE_URL}/meta/${type}/${imdbId}.json`, {
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.meta || null
  }
}

module.exports = { CinemetaClient }
