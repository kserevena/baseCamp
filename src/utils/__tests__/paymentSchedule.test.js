import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { pendingPaymentDates } from '@/utils/paymentSchedule.js'

// Format a Date (UTC midnight) as YYYY-MM-DD for stable comparison.
const ymd = (d) => d.toISOString().slice(0, 10)

describe('pendingPaymentDates', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // [name, today, lastUpdated, paymentDay, expected (array of YYYY-MM-DD)]
  const cases = [
    // Exclusive of lastUpdated: its own weekday is NOT counted.
    ['excludes lastUpdated itself (same day, same weekday)',
      '2025-06-13', '2025-06-13', 5, []],
    // One occurrence in a short window.
    ['one occurrence in the window',
      '2025-06-13', '2025-06-09', 5, ['2025-06-13']],
    // Exclusive boundary skips lastUpdated's Friday, picks the NEXT Friday.
    ['skips lastUpdated weekday and picks the next occurrence',
      '2025-06-20', '2025-06-13', 5, ['2025-06-20']],
    // Two occurrences.
    ['two occurrences in the window',
      '2025-06-20', '2025-06-06', 5, ['2025-06-13', '2025-06-20']],
    // Month boundary (Jan → Feb).
    ['spans a month boundary',
      '2025-02-04', '2025-01-28', 1, ['2025-02-03']],
    // Year boundary (Dec 2024 → Jan 2025).
    ['spans a year boundary',
      '2025-01-05', '2024-12-28', 3, ['2025-01-01']],
    // Leap day: 29 Feb 2024 is a Thursday and must be counted.
    ['counts the leap day (29 Feb 2024)',
      '2024-03-03', '2024-02-25', 4, ['2024-02-29']],
    // DST regression — UK spring-forward day (30 Mar 2025) is a Sunday; with UTC
    // math it is counted exactly once, never doubled or skipped.
    ['handles UK DST spring-forward without double/skip',
      '2025-04-02', '2025-03-26', 0, ['2025-03-30']],
    // DST regression — UK autumn-back day (26 Oct 2025) is a Sunday.
    ['handles UK DST autumn-back without double/skip',
      '2025-10-29', '2025-10-22', 0, ['2025-10-26']],
    // Defensive: a lastUpdated in the future yields no payments.
    ['returns empty when lastUpdated is in the future',
      '2025-06-13', '2025-12-25', 4, []],
  ]

  it.each(cases)('%s', (_name, today, lastUpdated, paymentDay, expected) => {
    vi.setSystemTime(new Date(today))
    const result = pendingPaymentDates(new Date(lastUpdated), paymentDay)
    expect(result.map(ymd)).toEqual(expected)
  })

  // All seven weekdays over one fixed 7-day window (each weekday occurs exactly once).
  const sevenDayWindow = [
    [0, '2025-06-08'], // Sunday
    [1, '2025-06-09'], // Monday
    [2, '2025-06-10'], // Tuesday
    [3, '2025-06-11'], // Wednesday
    [4, '2025-06-12'], // Thursday
    [5, '2025-06-13'], // Friday
    [6, '2025-06-07'], // Saturday
  ]

  it.each(sevenDayWindow)(
    'finds exactly one occurrence of paymentDay %i in a 7-day window',
    (paymentDay, expectedDate) => {
      vi.setSystemTime(new Date('2025-06-13'))
      const result = pendingPaymentDates(new Date('2025-06-06'), paymentDay)
      expect(result.map(ymd)).toEqual([expectedDate])
    },
  )

  it('counts exactly 53 Wednesdays across a full year gap', () => {
    vi.setSystemTime(new Date('2025-01-01'))
    const result = pendingPaymentDates(new Date('2024-01-01'), 3)
    expect(result).toHaveLength(53)
    result.forEach(d => expect(d.getUTCDay()).toBe(3))
  })

  it('returns dates strictly after lastUpdated and on or before today', () => {
    vi.setSystemTime(new Date('2025-06-13'))
    const lastUpdated = new Date('2025-05-01')
    const today = new Date('2025-06-13T00:00:00Z')
    const result = pendingPaymentDates(lastUpdated, 1)
    result.forEach(d => {
      expect(d > lastUpdated).toBe(true)
      expect(d <= today).toBe(true)
    })
  })

  it('returns only dates whose getUTCDay matches paymentDay', () => {
    vi.setSystemTime(new Date('2025-06-20'))
    const result = pendingPaymentDates(new Date('2025-06-01'), 2) // Tuesday
    expect(result.length).toBeGreaterThan(0)
    result.forEach(d => expect(d.getUTCDay()).toBe(2))
  })

  it.each([null, undefined, 0, ''])('returns [] for falsy lastUpdated (%s)', (val) => {
    vi.setSystemTime(new Date('2025-06-13'))
    expect(pendingPaymentDates(val, 5)).toEqual([])
  })
})
