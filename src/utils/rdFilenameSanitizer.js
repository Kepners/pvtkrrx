const RD_FILTER_KEYWORDS = [
  'WEB-DL',
  'WEBRip',
  'WEB.DL',
  'WEB.RIP',
  'AMZN',
  'NF',
  'CR',
  'ATVP',
  'DSNP',
  'MAX',
  'HMAX',
  'HBO',
  'HULU',
  'YTS',
  'RARBG',
  'FGT',
  'NTb',
  'EVO',
  'GHOST',
  'MeGusta',
  'AFG',
  'NIIN',
  'TGx',
  'GalaxyRG',
  'AOC',
  'PSA',
  'ETHEL',
  'FLUX',
  'EDITH',
  'FraMeSToR',
  'CMRG'
];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeMagnetValue(value) {
  try {
    return decodeURIComponent(String(value || '').replace(/\+/g, '%20'));
  } catch (_) {
    return String(value || '');
  }
}

function hasLettersOrNumbers(value) {
  return /[\p{L}\p{N}]/u.test(String(value || ''));
}

/**
 * Real-Debrid's May 2026 filter can inspect the magnet display name. This only
 * sanitizes dn=; internal torrent file paths remain outside PVTKRR's control.
 *
 * @param {string} displayName
 * @returns {string}
 */
function sanitizeDisplayName(displayName) {
  let sanitized = String(displayName || '');

  for (const keyword of RD_FILTER_KEYWORDS) {
    const pattern = new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(keyword)}(?=$|[^A-Za-z0-9])`, 'gi');
    sanitized = sanitized.replace(pattern, '$1');
  }

  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  if (!sanitized || !hasLettersOrNumbers(sanitized)) {
    return 'file';
  }

  return sanitized;
}

/**
 * @param {string} magnet
 * @returns {string}
 */
function sanitizeMagnet(magnet) {
  const raw = String(magnet || '');
  if (!/^magnet:\?/i.test(raw)) return raw;

  const queryStart = raw.indexOf('?');
  if (queryStart === -1) return raw;

  const prefix = raw.slice(0, queryStart + 1);
  const query = raw.slice(queryStart + 1);
  const parts = query.split('&');
  let changed = false;

  const nextParts = parts.map((part) => {
    const eqIndex = part.indexOf('=');
    const key = eqIndex === -1 ? part : part.slice(0, eqIndex);
    if (key.toLowerCase() !== 'dn') return part;

    const value = eqIndex === -1 ? '' : part.slice(eqIndex + 1);
    const displayName = decodeMagnetValue(value);
    const sanitized = sanitizeDisplayName(displayName);
    changed = changed || sanitized !== displayName;
    return `${key}=${encodeURIComponent(sanitized)}`;
  });

  if (!parts.some((part) => part.slice(0, part.indexOf('=') === -1 ? part.length : part.indexOf('=')).toLowerCase() === 'dn')) {
    return raw;
  }

  return changed ? `${prefix}${nextParts.join('&')}` : raw;
}

module.exports = {
  RD_FILTER_KEYWORDS,
  sanitizeDisplayName,
  sanitizeMagnet
};
