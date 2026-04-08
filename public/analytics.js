(async () => {
  if (window.__pvtkrrxAnalyticsBooted) return
  window.__pvtkrrxAnalyticsBooted = true

  try {
    const response = await fetch('/analytics-config.json', {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    })
    if (!response.ok) return

    const config = await response.json()
    if (!config || config.enabled !== true || config.provider !== 'umami') return
    if (!config.scriptUrl || !config.websiteId) return
    if (document.querySelector('script[data-pvtkrrx-analytics="umami"]')) return

    const script = document.createElement('script')
    script.defer = true
    script.async = true
    script.src = String(config.scriptUrl)
    script.dataset.websiteId = String(config.websiteId)
    script.dataset.pvtkrrxAnalytics = 'umami'
    document.head.appendChild(script)
  } catch (_) {}
})()
