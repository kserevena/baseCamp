import { describe, it, expect } from 'vitest'
import { formatGBP } from '@/utils/currency.js'

describe('formatGBP', () => {
  it('always renders two decimal places with a £ prefix', () => {
    expect(formatGBP(0)).toBe('£0.00')
    expect(formatGBP(4.5)).toBe('£4.50')
    expect(formatGBP(10)).toBe('£10.00')
    expect(formatGBP(12.5)).toBe('£12.50')
  })
})
