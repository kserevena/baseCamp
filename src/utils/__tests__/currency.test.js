import { describe, it, expect } from 'vitest'
import { formatGBP } from '@/utils/currency.js'

describe('formatGBP', () => {
  it('always renders two decimal places with a £ prefix', () => {
    expect(formatGBP(0)).toBe('£0.00')
    expect(formatGBP(4.5)).toBe('£4.50')
    expect(formatGBP(10)).toBe('£10.00')
    expect(formatGBP(12.5)).toBe('£12.50')
  })

  it('formats negative amounts (overdraft after large withdrawal)', () => {
    expect(formatGBP(-5)).toBe('£-5.00')
    expect(formatGBP(-0.5)).toBe('£-0.50')
  })

  it('accepts integer amounts', () => {
    expect(formatGBP(100)).toBe('£100.00')
  })

  it('handles amounts passed as strings by coercing to number', () => {
    expect(formatGBP('3.5')).toBe('£3.50')
  })
})
