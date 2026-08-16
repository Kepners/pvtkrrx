const {
  ServiceApiError,
  fetchWithRetry
} = require('../debrid/base');

function getCacheSearchSource(type, apiKey) {
  switch (String(type || '').toLowerCase()) {
    case 'putio': {
      const { PutioCacheSearchSource } = require('./putio');
      return new PutioCacheSearchSource(apiKey);
    }
    case 'pm': {
      const { PremiumizeCacheSearchSource } = require('./premiumize');
      return new PremiumizeCacheSearchSource(apiKey);
    }
    case 'rd': {
      const { RealDebridCacheSearchSource } = require('./realdebrid');
      return new RealDebridCacheSearchSource(apiKey);
    }
    default:
      throw new ServiceApiError({
        serviceId: String(type || 'unknown'),
        endpoint: 'cacheSearch.factory',
        status: 0,
        body: { error: 'unknown cache search source' }
      });
  }
}

module.exports = {
  ServiceApiError,
  fetchWithRetry,
  getCacheSearchSource
};
