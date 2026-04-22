const TEAM_ALIASES = [
  { re: /\bmanchi(?:\s+utd)?\b/gi, value: 'manchester united' },
  { re: /\bman(?:chester)?[\s.\-_]*utd\b/gi, value: 'manchester united' },
  { re: /\bman[\s.\-_]*u\b/gi, value: 'manchester united' },
  { re: /\butd\b/gi, value: 'united' },
  { re: /\bspurs\b/gi, value: 'tottenham hotspur' },
  { re: /\bnewc\b/gi, value: 'newcastle' },
  { re: /\bwolves\b/gi, value: 'wolverhampton' }
]

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function applyTeamAliases(value) {
  let text = String(value || '')
  for (const alias of TEAM_ALIASES) {
    text = text.replace(alias.re, alias.value)
  }
  return normalizeSpace(text)
}

function normalizeTeamName(value) {
  return normalizeSpace(applyTeamAliases(String(value || '').replace(/[._]+/g, ' '))).toLowerCase()
}

module.exports = {
  normalizeTeamName
}
