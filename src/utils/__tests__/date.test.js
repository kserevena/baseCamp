import { describe, it, expect } from 'vitest'
import { formatDate } from '@/utils/date.js'

// TZ is pinned to UTC in the vitest config, so a UTC-midnight date renders on
// the same calendar day regardless of the host machine.
describe('formatDate', () => {
  it('returns an empty string for a missing value', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate(undefined)).toBe('')
  })

  it('formats a Firestore-like Timestamp via toDate()', () => {
    const ts = { toDate: () => new Date('2026-06-09T00:00:00Z') }
    expect(formatDate(ts)).toBe('9 Jun 2026')
  })

  it('formats a Date passed directly', () => {
    expect(formatDate(new Date('2026-12-25T00:00:00Z'))).toBe('25 Dec 2026')
  })
})
