function isCompletedTorrent(torrent, fileProgress = null) {
  const torrentProgress = Number(torrent?.progress || 0)
  if (torrentProgress >= 0.999) return true
  if (Number.isFinite(fileProgress) && fileProgress >= 0.999) return true
  return false
}

module.exports = {
  isCompletedTorrent
}
