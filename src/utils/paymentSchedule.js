// Returns an array of Date objects for each occurrence of paymentDay (0=Sun…6=Sat)
// strictly after lastUpdated and up to and including today.
//
// All day boundaries are computed in UTC (getUTCDay/setUTCHours/setUTCDate), NOT the
// device's local timezone. This is deliberate: the accrued amount depends only on how
// many payment-weekdays fall between lastUpdated and now, and anchoring that count to
// an absolute timeline makes it invariant to the device's timezone. A device that
// travels or has its clock zone changed can never double-count or skip a week, because
// UTC day boundaries don't move. The trade-off is that a payment posts on UTC midnight
// rather than the family's local midnight — a cosmetic difference for a UK family, and
// the amount is always correct. Respecting a family's own (non-UTC) timezone is a future
// UX refinement tracked in GitHub issue #15 (see README / CLAUDE.md "UTC-based").
//
// A missing or falsy lastUpdated is treated as "now" (zero pending payments).
export function pendingPaymentDates(lastUpdated, paymentDay) {
  if (!lastUpdated) return []

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const cursor = new Date(lastUpdated)
  cursor.setUTCHours(0, 0, 0, 0)
  cursor.setUTCDate(cursor.getUTCDate() + 1) // exclusive of lastUpdated

  const dates = []
  while (cursor <= today) {
    if (cursor.getUTCDay() === paymentDay) {
      dates.push(new Date(cursor))
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}
