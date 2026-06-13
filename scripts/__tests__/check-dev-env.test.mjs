// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { validate } from '../check-dev-env.mjs'

const VALID = 'VITE_FIREBASE_PROJECT_ID=basecamp-app-dev\nVITE_USE_EMULATOR=false'

describe('validate', () => {
  it('returns null for a valid dev .env', () => {
    expect(validate(VALID)).toBeNull()
  })

  it('returns an error when project ID is the prod project', () => {
    const raw = 'VITE_FIREBASE_PROJECT_ID=basecamp-app-prod\nVITE_USE_EMULATOR=false'
    const result = validate(raw)
    expect(result).toContain('basecamp-app-prod')
    expect(result).toContain('basecamp-app-dev')
  })

  it('returns an error when project ID is empty', () => {
    const raw = 'VITE_FIREBASE_PROJECT_ID=\nVITE_USE_EMULATOR=false'
    const result = validate(raw)
    expect(result).toContain('(unset)')
  })

  it('returns an error when project ID is absent', () => {
    const result = validate('VITE_USE_EMULATOR=false')
    expect(result).toContain('(unset)')
  })

  it('returns an error when VITE_USE_EMULATOR is true', () => {
    const raw = 'VITE_FIREBASE_PROJECT_ID=basecamp-app-dev\nVITE_USE_EMULATOR=true'
    const result = validate(raw)
    expect(result).toContain('VITE_USE_EMULATOR=true')
  })

  it('ignores blank lines and # comments', () => {
    const raw = [
      '# dev config',
      '',
      'VITE_FIREBASE_PROJECT_ID=basecamp-app-dev',
      '# emulator off',
      'VITE_USE_EMULATOR=false',
    ].join('\n')
    expect(validate(raw)).toBeNull()
  })
})
