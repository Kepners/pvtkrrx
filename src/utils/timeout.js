/**
 * Promise timeout utilities.
 *
 * withTimeout  — returns the value or fallback on timeout/error.
 * settleWithTimeout — returns { value, timedOut, error } for callers that need metadata.
 */

function withTimeout(promise, timeoutMs, fallbackValue) {
  const timeout = Math.max(500, Number.parseInt(String(timeoutMs || 0), 10) || 0)
  if (!timeout) {
    return Promise.resolve(promise).catch(() => fallbackValue)
  }

  return Promise.race([
    Promise.resolve(promise).catch(() => fallbackValue),
    new Promise(resolve => setTimeout(() => resolve(fallbackValue), timeout))
  ])
}

function settleWithTimeout(promise, timeoutMs, fallbackValue) {
  const timeout = Math.max(500, Number.parseInt(String(timeoutMs || 0), 10) || 0)
  if (!timeout) {
    return Promise.resolve(promise)
      .then(value => ({ value, timedOut: false, error: null }))
      .catch(error => ({ value: fallbackValue, timedOut: false, error }))
  }

  return new Promise(resolve => {
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      done = true
      resolve({ value: fallbackValue, timedOut: true, error: null })
    }, timeout)

    Promise.resolve(promise)
      .then((value) => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve({ value, timedOut: false, error: null })
      })
      .catch((error) => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve({ value: fallbackValue, timedOut: false, error })
      })
  })
}

module.exports = { withTimeout, settleWithTimeout }
