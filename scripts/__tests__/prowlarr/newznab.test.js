const assert = require('node:assert/strict');
const { XMLParser } = require('fast-xml-parser');
const {
  detectProtocol,
  normalizeResult
} = require('../../../src/clients/prowlarr/newznab');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'item' || name === 'newznab:attr' || name === 'torznab:attr'
});

function firstItem(xml) {
  return parser.parse(xml).rss.channel.item[0];
}

async function run() {
  const nzbGeekItem = firstItem(`
    <rss><channel>
      <item>
        <title>NZBGeek Movie 2026</title>
        <link>https://nzbgeek.example/api?t=get&amp;id=1</link>
        <enclosure url="https://nzbgeek.example/download/1.nzb" length="12345" type="application/x-nzb" />
        <newznab:attr name="grabs" value="12" />
        <prowlarr:indexer>NZBGeek</prowlarr:indexer>
        <pubDate>Sat, 23 May 2026 10:00:00 GMT</pubDate>
      </item>
    </channel></rss>
  `);
  assert.equal(detectProtocol(nzbGeekItem), 'usenet');
  assert.deepEqual(normalizeResult(nzbGeekItem), {
    protocol: 'usenet',
    title: 'NZBGeek Movie 2026',
    sizeBytes: 12345,
    sourceUrl: 'https://nzbgeek.example/download/1.nzb',
    indexer: 'NZBGeek',
    publishDate: '2026-05-23T10:00:00.000Z',
    grabs: 12
  });

  const hydraItem = firstItem(`
    <rss><channel>
      <item>
        <title>NZBHydra2 Movie 2026</title>
        <link>https://hydra.example/get/movie.nzb?apikey=redacted</link>
        <newznab:attr name="size" value="23456" />
        <prowlarr:indexer>NZBHydra2</prowlarr:indexer>
      </item>
    </channel></rss>
  `);
  assert.equal(detectProtocol(hydraItem), 'usenet');

  const genericNewznabItem = firstItem(`
    <rss><channel>
      <item>
        <title>Generic Newznab Movie 2026</title>
        <link>https://newznab.example/api?t=get&amp;id=2</link>
        <newznab:attr name="usenetdate" value="2026-05-23T11:00:00Z" />
        <newznab:attr name="size" value="34567" />
        <prowlarr:indexer>Generic Newznab</prowlarr:indexer>
      </item>
    </channel></rss>
  `);
  assert.equal(detectProtocol(genericNewznabItem), 'usenet');

  const torznabItem = firstItem(`
    <rss><channel>
      <item>
        <title>Torznab Movie 2026</title>
        <link>magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12&amp;dn=Movie</link>
        <torznab:attr name="size" value="45678" />
        <torznab:attr name="seeders" value="45" />
        <torznab:attr name="infohash" value="abcdef1234567890abcdef1234567890abcdef12" />
        <prowlarr:indexer>Generic Torznab</prowlarr:indexer>
        <pubDate>2026-05-23T12:00:00Z</pubDate>
      </item>
    </channel></rss>
  `);
  assert.equal(detectProtocol(torznabItem), 'torrent');
  assert.deepEqual(normalizeResult(torznabItem), {
    protocol: 'torrent',
    title: 'Torznab Movie 2026',
    sizeBytes: 45678,
    sourceUrl: 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12&dn=Movie',
    infohash: 'abcdef1234567890abcdef1234567890abcdef12',
    indexer: 'Generic Torznab',
    publishDate: '2026-05-23T12:00:00.000Z',
    seeders: 45
  });
}

run()
  .then(() => console.log('[newznab.test] PASS'))
  .catch((error) => {
    console.error('[newznab.test] FAIL');
    console.error(error);
    process.exit(1);
  });
