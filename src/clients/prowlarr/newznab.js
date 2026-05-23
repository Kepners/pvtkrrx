function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, '#text')) return String(value['#text'] || '');
    if (Object.prototype.hasOwnProperty.call(value, '_text')) return String(value._text || '');
  }
  return String(value || '');
}

function attrValue(node, name) {
  if (!node || typeof node !== 'object') return '';
  return String(node[`@_${name}`] ?? node[name] ?? '');
}

function collectProtocolAttrs(rawItem) {
  const attrs = new Map();
  for (const key of ['newznab:attr', 'torznab:attr', 'attr']) {
    for (const attr of asArray(rawItem?.[key])) {
      const name = attrValue(attr, 'name').toLowerCase();
      if (!name) continue;
      attrs.set(name, attrValue(attr, 'value'));
    }
  }
  return attrs;
}

function enclosureNodes(rawItem) {
  return asArray(rawItem?.enclosure);
}

function enclosureType(enclosure) {
  return attrValue(enclosure, 'type').toLowerCase();
}

function enclosureUrl(enclosure) {
  return attrValue(enclosure, 'url');
}

function linkWithoutQuery(link) {
  return String(link || '').split('#')[0].split('?')[0];
}

function detectProtocol(rawItem) {
  for (const enclosure of enclosureNodes(rawItem)) {
    if (enclosureType(enclosure).includes('application/x-nzb')) {
      return 'usenet';
    }
  }

  const link = textValue(asArray(rawItem?.link)[0]);
  if (/\.nzb$/i.test(linkWithoutQuery(link))) {
    return 'usenet';
  }

  const attrs = collectProtocolAttrs(rawItem);
  if (attrs.has('usenetdate')) {
    return 'usenet';
  }

  return 'torrent';
}

function attrNumber(attrs, names) {
  for (const name of names) {
    const value = Number(attrs.get(name));
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return 0;
}

function enclosureLength(rawItem) {
  for (const enclosure of enclosureNodes(rawItem)) {
    const length = Number(attrValue(enclosure, 'length'));
    if (Number.isFinite(length) && length >= 0) return length;
  }
  return 0;
}

function extractInfohash(value) {
  const raw = String(value || '');
  const xtMatch = raw.match(/xt=urn:btih:([a-z0-9]{32,40})/i);
  if (xtMatch) return xtMatch[1].toLowerCase();
  const hexMatch = raw.match(/\b[0-9a-f]{40}\b/i);
  if (hexMatch) return hexMatch[0].toLowerCase();
  return '';
}

function isoDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toISOString();
}

function firstMagnet(rawItem, attrs, title) {
  const candidates = [
    textValue(rawItem?.link),
    enclosureUrl(enclosureNodes(rawItem)[0]),
    attrs.get('magneturl'),
    attrs.get('magnet'),
    textValue(rawItem?.guid)
  ].filter(Boolean);

  const magnet = candidates.find(candidate => /^magnet:\?/i.test(candidate));
  if (magnet) return magnet;

  const infohash = attrs.get('infohash') || candidates.map(extractInfohash).find(Boolean);
  if (infohash) {
    return `magnet:?xt=urn:btih:${infohash.toLowerCase()}&dn=${encodeURIComponent(title)}`;
  }

  return candidates[0] || '';
}

function firstNzbUrl(rawItem) {
  const nzbEnclosure = enclosureNodes(rawItem).find(enclosure => enclosureType(enclosure).includes('application/x-nzb'));
  if (nzbEnclosure) return enclosureUrl(nzbEnclosure);
  return textValue(rawItem?.link);
}

function normalizeResult(rawItem) {
  const protocol = detectProtocol(rawItem);
  const attrs = collectProtocolAttrs(rawItem);
  const title = textValue(rawItem?.title);
  const sizeBytes = attrNumber(attrs, ['size', 'filesize']) || enclosureLength(rawItem) || Number(textValue(rawItem?.size) || 0);
  const publishDate = isoDate(rawItem?.pubDate || attrs.get('usenetdate'));
  const indexer = textValue(rawItem?.indexer || rawItem?.['prowlarr:indexer'] || rawItem?.['torznab:indexer'] || rawItem?.['newznab:indexer']);

  if (protocol === 'usenet') {
    return {
      protocol,
      title,
      sizeBytes,
      sourceUrl: firstNzbUrl(rawItem),
      indexer,
      ...(publishDate ? { publishDate } : {}),
      ...(attrNumber(attrs, ['grabs']) ? { grabs: attrNumber(attrs, ['grabs']) } : {})
    };
  }

  const sourceUrl = firstMagnet(rawItem, attrs, title);
  const infohash = attrs.get('infohash') || extractInfohash(sourceUrl) || extractInfohash(rawItem?.guid);
  return {
    protocol,
    title,
    sizeBytes,
    sourceUrl,
    ...(infohash ? { infohash: String(infohash).toLowerCase() } : {}),
    indexer,
    ...(publishDate ? { publishDate } : {}),
    ...(attrNumber(attrs, ['seeders']) ? { seeders: attrNumber(attrs, ['seeders']) } : {})
  };
}

module.exports = {
  detectProtocol,
  normalizeResult,
  extractInfohash
};
