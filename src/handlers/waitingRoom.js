'use strict'

const fs = require('node:fs')
const path = require('node:path')

const WAITING_ROOM_VIDEO_PATH = path.join(__dirname, '..', '..', 'public', 'media', 'pvtkrrx-waiting-room.mp4')
const WAITING_ROOM_CONTENT_TYPE = 'video/mp4'

function sanitizeHeaderValue(value) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^\x20-\x7e]/g, '')
    .slice(0, 160)
}

function setOptionalHeader(res, name, value) {
  if (value === undefined || value === null || value === '') return
  res.setHeader(name, sanitizeHeaderValue(value))
}

function normalizeProgress(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  if (number <= 1) return Math.max(0, Math.min(100, Math.round(number * 100)))
  return Math.max(0, Math.min(100, Math.round(number)))
}

function setWaitingRoomHeaders(res, details = {}) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Content-Type', WAITING_ROOM_CONTENT_TYPE)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-PVTKRRX-Waiting-Room', '1')
  setOptionalHeader(res, 'X-PVTKRRX-Waiting-Kind', details.kind || 'playback')
  setOptionalHeader(res, 'X-PVTKRRX-Waiting-Reason', details.reason)
  setOptionalHeader(res, 'X-PVTKRRX-Waiting-State', details.state)
  setOptionalHeader(res, 'X-PVTKRRX-Waiting-Provider', details.provider)
  const progress = normalizeProgress(details.progress)
  if (progress !== null) {
    res.setHeader('X-PVTKRRX-Progress', String(progress))
  }
  if (Number.isFinite(Number(details.retryAfterSeconds))) {
    res.setHeader('Retry-After', String(Math.max(1, Math.round(Number(details.retryAfterSeconds)))))
  }
}

function waitingRoomAvailable() {
  try {
    const stat = fs.statSync(WAITING_ROOM_VIDEO_PATH)
    return stat.isFile() && stat.size > 0
  } catch (_) {
    return false
  }
}

function parseRange(rangeHeader, size) {
  const text = String(rangeHeader || '').trim()
  if (!text) return null
  const match = /^bytes=(\d*)-(\d*)$/i.exec(text)
  if (!match) return { invalid: true }

  let start = match[1] ? Number.parseInt(match[1], 10) : NaN
  let end = match[2] ? Number.parseInt(match[2], 10) : NaN

  if (!Number.isFinite(start) && Number.isFinite(end)) {
    const suffixLength = end
    if (suffixLength <= 0) return { invalid: true }
    start = Math.max(0, size - suffixLength)
    end = size - 1
  }

  if (!Number.isFinite(start)) return { invalid: true }
  if (!Number.isFinite(end)) end = size - 1
  if (start < 0 || end < start || start >= size) return { invalid: true }
  return {
    start,
    end: Math.min(end, size - 1)
  }
}

function responseCanStream(res) {
  return Boolean(res && typeof res.setHeader === 'function' && typeof res.write === 'function' && typeof res.on === 'function')
}

function sendWaitingRoomHead(req, res, details = {}) {
  if (!waitingRoomAvailable()) return false
  const stat = fs.statSync(WAITING_ROOM_VIDEO_PATH)
  setWaitingRoomHeaders(res, details)
  res.setHeader('Content-Length', String(stat.size))
  return res.status(200).end()
}

function sendWaitingRoomVideo(req, res, details = {}) {
  if (!waitingRoomAvailable() || !responseCanStream(res)) return false
  const stat = fs.statSync(WAITING_ROOM_VIDEO_PATH)
  const size = stat.size
  setWaitingRoomHeaders(res, details)

  const range = parseRange(req?.headers?.range, size)
  if (range?.invalid) {
    res.setHeader('Content-Range', `bytes */${size}`)
    res.setHeader('Content-Length', '0')
    return res.status(416).end()
  }

  if (range) {
    res.status(206)
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`)
    res.setHeader('Content-Length', String(range.end - range.start + 1))
  } else {
    res.status(200)
    res.setHeader('Content-Length', String(size))
  }

  if (String(req?.method || '').toUpperCase() === 'HEAD') {
    return res.end()
  }

  const streamOptions = range ? { start: range.start, end: range.end } : undefined
  const stream = fs.createReadStream(WAITING_ROOM_VIDEO_PATH, streamOptions)
  let settled = false

  stream.on('error', (err) => {
    if (settled) return
    settled = true
    if (!res.headersSent) {
      try {
        res.removeHeader('Content-Length')
        res.removeHeader('Content-Range')
      } catch (_) {}
      return res.status(500).json({ error: 'Waiting room video failed' })
    }
    try {
      res.destroy(err)
    } catch (_) {}
  })

  res.on('close', () => {
    if (!res.writableEnded) {
      try {
        stream.destroy()
      } catch (_) {}
    }
  })

  stream.pipe(res)
  return true
}

module.exports = {
  WAITING_ROOM_VIDEO_PATH,
  waitingRoomAvailable,
  sendWaitingRoomHead,
  sendWaitingRoomVideo
}
