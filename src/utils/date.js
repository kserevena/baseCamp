// Formats a Firestore Timestamp (or Date/millis) as a GB-style date,
// e.g. "9 Jun 2026". Returns '' for a missing value.
export function formatDate(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
