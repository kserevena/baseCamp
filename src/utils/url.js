// URL helpers for user-entered links (wish list items).
//
// A link is stored and rendered as an href, so it must be a web address and
// nothing else. Two failure modes this guards against:
//   - a schemeless entry ("amazon.co.uk/dp/B01") resolves *relative* to the
//     current route, and the SPA rewrite plus the router catch-all then send
//     the new tab to the app's own home screen
//   - a "javascript:" or "data:" URI is not a link at all

const HTTP_SCHEME = /^https?:\/\//i
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:/i

// True only for a string that is already an http(s) URL. Use before binding a
// stored link to an href — documents may hold anything an older client wrote.
export function isHttpUrl(value) {
  return typeof value === 'string' && HTTP_SCHEME.test(value.trim())
}

// Normalises user input to an http(s) URL, or returns null when it cannot be:
// an empty entry, or one carrying a non-http scheme (javascript:, data:,
// mailto:, …). A schemeless entry gets https:// so it is never treated as a
// relative path.
export function normaliseHttpUrl(input) {
  const trimmed = (input ?? '').trim()
  if (!trimmed) return null
  if (HTTP_SCHEME.test(trimmed)) return trimmed
  if (ANY_SCHEME.test(trimmed)) return null
  return `https://${trimmed}`
}
