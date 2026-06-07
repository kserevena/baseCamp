// Preflight guard for `npm run deploy:prod`.
//
// Vite always loads `.env` first, then layers `.env.prod` on top. A prod build
// therefore relies on `.env.prod` overriding every key — a missing or wrong
// `.env.prod` would silently ship dev config to production. This script aborts
// the deploy before the build runs if `.env.prod` is absent or not pointing at
// the prod project.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ENV_PATH = resolve(process.cwd(), '.env.prod')
const EXPECTED_PROJECT_ID = 'basecamp-app-prod'

function fail(message) {
  console.error(`\n✖ deploy:prod aborted — ${message}\n`)
  process.exit(1)
}

let raw
try {
  raw = readFileSync(ENV_PATH, 'utf8')
} catch {
  fail('.env.prod not found at repo root. Create it from .env.example with the prod Firebase credentials.')
}

// Parse simple KEY=value lines (ignore blanks and # comments).
const env = {}
for (const line of raw.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq === -1) continue
  env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
}

if (env.VITE_FIREBASE_PROJECT_ID !== EXPECTED_PROJECT_ID) {
  fail(
    `.env.prod has VITE_FIREBASE_PROJECT_ID="${env.VITE_FIREBASE_PROJECT_ID ?? '(unset)'}" ` +
    `but expected "${EXPECTED_PROJECT_ID}". Refusing to deploy a non-prod config to prod.`,
  )
}

if (env.VITE_USE_EMULATOR === 'true') {
  fail('.env.prod has VITE_USE_EMULATOR=true. A prod build must not point at the emulator.')
}

console.log('✔ .env.prod preflight passed — building prod bundle.')
