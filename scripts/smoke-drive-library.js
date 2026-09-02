// Drive library resolution smoke test.
//
// Mirrors the real layout written by contabo-infra-notes
// stack/gdrive-media/archive-torrents-to-gdrive.sh + tv_media.py, mounted
// read-only at /opt/stack/gdrive-media/media:
//
//   <root>/Films and TV/TV/<Show>/Season NN/<Show> - SxxEyy - detail.ext
//   <root>/Films and TV/Films/<file>
//
// The archiver deletes the local torrent 7 days after the Drive copy verifies,
// so these lookups are the only thing keeping an archived title playable.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'local-smoke-secret-12345678901234567890'

const {
  findDriveEpisode,
  findDriveMovie,
  normalizeDriveLibraryRoot,
  normalizeIdentity,
  driveFileHash,
  clearDriveLibraryCache
} = require('../src/utils/driveLibrary')

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pvtkrrx-drive-smoke-'))

function writeVideo(relativePath, bytes = 1024) {
  const full = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, Buffer.alloc(bytes, 7))
  return full
}

async function run() {
  // Exactly the tree the archiver produces for the Skinwalker Ranch proof run.
  const skinwalker = writeVideo(
    'Films and TV/TV/The Secret of Skinwalker Ranch/Season 07/The Secret of Skinwalker Ranch - S07E05 - 1080p WEB h264-EDITH.mkv',
    2048
  )
  writeVideo('Films and TV/TV/The Secret of Skinwalker Ranch/Season 07/The Secret of Skinwalker Ranch - S07E06 - 1080p WEB h264-EDITH.mkv')
  writeVideo('Films and TV/TV/House of the Dragon (2022)/Season 01/House of the Dragon - S01E01 - 2160p.mkv')
  const film = writeVideo('Films and TV/Films/Dune Part Two 2024 2160p WEB-DL.mkv', 4096)
  writeVideo('Films and TV/Films/Dune 1984 1080p BluRay.mkv')
  // A sidecar must never be mistaken for the episode.
  writeVideo('Films and TV/TV/The Secret of Skinwalker Ranch/Season 07/The Secret of Skinwalker Ranch - S07E05.nfo')

  clearDriveLibraryCache()

  // ---- episode resolution -------------------------------------------------
  const episode = await findDriveEpisode(root, {
    title: 'The Secret of Skinwalker Ranch',
    season: 7,
    episode: 5
  })
  assert.ok(episode, 'an archived episode must resolve from the Drive library')
  assert.equal(episode.path, skinwalker, 'should resolve the exact SxxEyy file')
  assert.equal(episode.size, 2048)
  assert.match(episode.hash, /^[a-f0-9]{40}$/, 'the synthetic hash must satisfy the file-token hash rule')
  assert.equal(episode.hash, driveFileHash(skinwalker), 'the hash must be deterministic for one path')

  // S07E06 exists in the same folder; E5 must not bleed into E6 or vice versa.
  const sixth = await findDriveEpisode(root, { title: 'The Secret of Skinwalker Ranch', season: 7, episode: 6 })
  assert.ok(sixth && /S07E06/.test(sixth.name), 'each episode must resolve to its own file')

  // canonical_show() folds a trailing year into "(YYYY)"; Cinemeta supplies the
  // bare title, so the two still have to meet.
  const dragon = await findDriveEpisode(root, { title: 'House of the Dragon', season: 1, episode: 1 })
  assert.ok(dragon, 'a "(YYYY)"-suffixed show folder must match the bare Cinemeta title')

  // Release naming varies by tracker; identity matching is punctuation-blind.
  const punctuated = await findDriveEpisode(root, { title: 'the.secret.of.skinwalker.ranch', season: 7, episode: 5 })
  assert.ok(punctuated, 'show matching must ignore separators and case')

  assert.equal(
    await findDriveEpisode(root, { title: 'The Secret of Skinwalker Ranch', season: 7, episode: 99 }),
    null,
    'a missing episode must resolve to nothing rather than a near miss'
  )
  assert.equal(
    await findDriveEpisode(root, { title: 'Some Show That Was Never Archived', season: 1, episode: 1 }),
    null,
    'an unarchived show must resolve to nothing'
  )

  // ---- film resolution ----------------------------------------------------
  const movie = await findDriveMovie(root, { title: 'Dune Part Two', year: '2024' })
  assert.ok(movie, 'an archived film must resolve')
  assert.equal(movie.path, film)
  assert.equal(movie.size, 4096)

  // Same franchise, different year — the year must decide, not first-match.
  const original = await findDriveMovie(root, { title: 'Dune', year: '1984' })
  assert.ok(original && /1984/.test(original.name), 'the year must pick the right cut of a re-made title')
  assert.equal(
    await findDriveMovie(root, { title: 'Dune', year: '2099' }),
    null,
    'a year that matches nothing must not fall back to a different film'
  )

  // ---- guards -------------------------------------------------------------
  assert.equal(await findDriveEpisode('', { title: 'x', season: 1, episode: 1 }), null, 'no configured root = feature off')
  assert.equal(await findDriveMovie('', { title: 'x' }), null, 'no configured root = feature off')
  assert.equal(
    await findDriveEpisode(path.join(root, 'does-not-exist'), { title: 'x', season: 1, episode: 1 }),
    null,
    'an unmounted/missing library must fail closed, not throw'
  )

  assert.equal(normalizeDriveLibraryRoot('  "/opt/stack/gdrive-media/media/"  '), path.normalize('/opt/stack/gdrive-media/media'))
  assert.equal(normalizeDriveLibraryRoot(''), '')
  // Must stay in step with tv_media.py identity_key().
  assert.equal(normalizeIdentity('The.Secret_of-Skinwalker  Ranch'), 'the secret of skinwalker ranch')

  // ---- the /file route contract ------------------------------------------
  // The Drive file is played through the built-in /file route's orphan-path
  // branch, which requires a token carrying a syntactically valid hash and an
  // absolute path. A Drive file has no infohash, so the synthetic one has to
  // survive encode -> decode unchanged or playback 400s.
  const { encodeFileStateToken, decodeFileStateToken } = require('../src/utils/opaqueState')
  const token = encodeFileStateToken({ h: episode.hash, p: episode.path })
  const decoded = decodeFileStateToken(token)
  assert.equal(decoded.h, episode.hash, 'the synthetic hash must round-trip through the file token')
  assert.equal(decoded.p, episode.path, 'the absolute Drive path must round-trip through the file token')
  assert.ok(path.isAbsolute(decoded.p), 'the orphan-path branch only accepts an absolute path')
  assert.ok(fs.statSync(decoded.p).isFile(), 'the decoded path must still address the real file')

  console.log('Smoke drive library passed')
}

run()
  .catch((err) => {
    console.error('Smoke drive library failed')
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })
