import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('isDev', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('is true when VITE_USE_EMULATOR is "true"', async () => {
    vi.stubEnv('VITE_USE_EMULATOR', 'true')
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'basecamp-app-prod')
    const { isDev } = await import('@/utils/env.js')
    expect(isDev).toBe(true)
  })

  it('is true when project ID contains "dev"', async () => {
    vi.stubEnv('VITE_USE_EMULATOR', 'false')
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'basecamp-app-dev')
    const { isDev } = await import('@/utils/env.js')
    expect(isDev).toBe(true)
  })

  it('is false for a production project ID without emulator', async () => {
    vi.stubEnv('VITE_USE_EMULATOR', 'false')
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'basecamp-app-prod')
    const { isDev } = await import('@/utils/env.js')
    expect(isDev).toBe(false)
  })

  it('is false when env vars are absent', async () => {
    vi.stubEnv('VITE_USE_EMULATOR', '')
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '')
    const { isDev } = await import('@/utils/env.js')
    expect(isDev).toBe(false)
  })
})
