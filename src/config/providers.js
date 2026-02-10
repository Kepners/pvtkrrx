// Seedbox provider presets — path mapping between qBit save paths and HTTP file server URLs

const PROVIDERS = {
  feral: {
    name: 'Feral Hosting',
    pathMapping: { from: '/media/', to: '/' },
    notes: 'HTTP server at https://username.feralhosting.com/username/'
  },
  ultra: {
    name: 'Ultra.cc',
    pathMapping: { from: '/home/', to: '/' },
    notes: 'HTTP server at https://username.ultra.cc/'
  },
  whatbox: {
    name: 'Whatbox',
    pathMapping: { from: '/home/', to: '/' },
    notes: 'HTTP server at https://username.whatbox.ca/'
  },
  swizzin: {
    name: 'Swizzin',
    pathMapping: { from: '/home/', to: '/' },
    notes: 'Self-hosted with swizzin panel'
  },
  custom: {
    name: 'Custom / Other',
    pathMapping: { from: '', to: '' },
    notes: 'Set your own path mapping'
  }
}

module.exports = { PROVIDERS }
