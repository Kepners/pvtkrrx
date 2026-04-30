const {
  POSTER_CLASSES,
  classifySportsPosterEvent,
  hasActualPair
} = require('./sportsPosterClassifier')
const { normalizeSportsPosterTemplate } = require('./sportsPosterTemplates')

function classifySportsEvent(input = {}) {
  const classification = classifySportsPosterEvent(input)
  return POSTER_CLASSES.includes(classification) ? classification : 'generic_event'
}

function selectTemplateForSportsClass(eventClass = '', requestedTemplate = 'ticket-stub') {
  const normalized = normalizeSportsPosterTemplate(requestedTemplate || 'ticket-stub')
  if (normalized === 'glitch') return 'glitch'
  if (eventClass === 'team_vs_team') return normalized
  return normalized === 'ticket-stub' ? 'broadcast' : normalized
}

module.exports = {
  POSTER_CLASSES,
  classifySportsEvent,
  classifySportsPosterEvent,
  hasActualPair,
  selectTemplateForSportsClass
}
