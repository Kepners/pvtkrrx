const assert = require('node:assert/strict');
const {
  sanitizeDisplayName,
  sanitizeMagnet
} = require('../src/utils/rdFilenameSanitizer');

let checks = 0;

function check(label, fn) {
  fn();
  checks += 1;
}

function run() {
  check('WEB-DL stripped from middle of name', () => {
    assert.equal(sanitizeDisplayName('Movie WEB-DL 2026'), 'Movie 2026');
  });

  check('multiple keywords stripped from one name', () => {
    assert.equal(sanitizeDisplayName('Show AMZN NF WEBRip 1080p'), 'Show 1080p');
  });

  check('keywords inside words are preserved', () => {
    assert.equal(sanitizeDisplayName('INFAMOUS 2026'), 'INFAMOUS 2026');
  });

  check('empty display name falls back to file', () => {
    assert.equal(sanitizeDisplayName('WEB-DL AMZN NF'), 'file');
  });

  check('magnet with no dn is unchanged', () => {
    const magnet = 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12&tr=udp%3A%2F%2Ftracker';
    assert.equal(sanitizeMagnet(magnet), magnet);
  });

  check('multiple trackers are preserved', () => {
    const magnet = 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12&dn=Movie%20WEB-DL&tr=udp%3A%2F%2Fone&tr=udp%3A%2F%2Ftwo';
    const sanitized = sanitizeMagnet(magnet);
    assert.match(sanitized, /tr=udp%3A%2F%2Fone/);
    assert.match(sanitized, /tr=udp%3A%2F%2Ftwo/);
    assert.doesNotMatch(decodeURIComponent(sanitized), /WEB-DL/i);
  });

  check('unicode title characters are preserved', () => {
    const magnet = 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12&dn=Amelie%20%C3%A9dition%20WEB-DL';
    const sanitized = sanitizeMagnet(magnet);
    assert.match(decodeURIComponent(sanitized), /Amelie edition|Amelie édition/i);
    assert.doesNotMatch(decodeURIComponent(sanitized), /WEB-DL/i);
  });

  check('result remains a valid magnet URI', () => {
    const magnet = 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12&dn=Movie%20AMZN';
    const sanitized = sanitizeMagnet(magnet);
    assert.doesNotThrow(() => new URL(sanitized));
    assert.equal(new URL(sanitized).protocol, 'magnet:');
  });
}

try {
  run();
  console.log(`[smoke-rd-sanitizer] PASS (${checks} checks)`);
} catch (error) {
  console.error(`[smoke-rd-sanitizer] FAIL: ${error.message}`);
  process.exit(1);
}
