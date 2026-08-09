import { describe, it, expect } from 'vitest'
import { isHttpUrl, normaliseHttpUrl } from '@/utils/url.js'

describe('isHttpUrl', () => {
  it('accepts http and https URLs', () => {
    expect(isHttpUrl('http://example.com')).toBe(true)
    expect(isHttpUrl('https://example.com/dp/B01?x=1')).toBe(true)
    expect(isHttpUrl('  https://example.com  ')).toBe(true)
    expect(isHttpUrl('HTTPS://EXAMPLE.COM')).toBe(true)
  })

  it('rejects other schemes, schemeless input, and non-strings', () => {
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpUrl('data:text/html,<script>')).toBe(false)
    expect(isHttpUrl('mailto:someone@example.com')).toBe(false)
    expect(isHttpUrl('example.com')).toBe(false)
    expect(isHttpUrl('')).toBe(false)
    expect(isHttpUrl(null)).toBe(false)
    expect(isHttpUrl(undefined)).toBe(false)
    expect(isHttpUrl(42)).toBe(false)
  })
})

describe('normaliseHttpUrl', () => {
  it('passes through an http(s) URL unchanged, trimmed', () => {
    expect(normaliseHttpUrl('https://example.com/x')).toBe('https://example.com/x')
    expect(normaliseHttpUrl('  http://example.com  ')).toBe('http://example.com')
  })

  it('adds https:// to a schemeless entry so it is not treated as a relative path', () => {
    expect(normaliseHttpUrl('amazon.co.uk/dp/B0123')).toBe('https://amazon.co.uk/dp/B0123')
    expect(normaliseHttpUrl('www.example.com')).toBe('https://www.example.com')
  })

  it('rejects non-http schemes', () => {
    expect(normaliseHttpUrl('javascript:alert(1)')).toBeNull()
    expect(normaliseHttpUrl('JavaScript:alert(1)')).toBeNull()
    expect(normaliseHttpUrl('data:text/html,<script>')).toBeNull()
    expect(normaliseHttpUrl('mailto:someone@example.com')).toBeNull()
  })

  it('returns null for empty or missing input', () => {
    expect(normaliseHttpUrl('')).toBeNull()
    expect(normaliseHttpUrl('   ')).toBeNull()
    expect(normaliseHttpUrl(null)).toBeNull()
    expect(normaliseHttpUrl(undefined)).toBeNull()
  })
})
