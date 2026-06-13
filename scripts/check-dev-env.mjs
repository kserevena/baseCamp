// Preflight guard for `npm run deploy:dev`.
//
// Vite loads `.env` for the dev build. A missing or misconfigured `.env`
// would silently deploy the wrong Firebase project. This script aborts the
// deploy before the build runs if `.env` is absent or not pointing at the dev
// project.
//
// `validate(raw)` is exported so unit tests can exercise the logic directly
// without spawning a subprocess.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ENV_PATH = resolve(process.cwd(), '.env')
const EXPECTED_PROJECT_ID = 'basecamp-app-dev'

// Parse simple KEY=value lines (ignore blanks and # comments).
function parse(raw) {
  const env = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return env
}

// Returns null on success, or an error string describing the problem.
export function validate(raw) {
  const env = parse(raw)

  if (env.VITE_FIREBASE_PROJECT_ID !== EXPECTED_PROJECT_ID) {
    return (
      `.env has VITE_FIREBASE_PROJECT_ID="${env.VITE_FIREBASE_PROJECT_ID || '(unset)'}" ` +
      `but expected "${EXPECTED_PROJECT_ID}". Refusing to deploy a non-dev config to dev.`
    )
  }

  if (env.VITE_USE_EMULATOR === 'true') {
    return '.env has VITE_USE_EMULATOR=true. A dev deploy must not point at the emulator.'
  }

  return null
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let raw
  try {
    raw = readFileSync(ENV_PATH, 'utf8')
  } catch {
    console.error('\n✖ deploy:dev aborted — .env not found at repo root. Create it from .env.example with the dev Firebase credentials.\n')
    process.exit(1)
  }

  const error = validate(raw)
  if (error) {
    console.error(`\n✖ deploy:dev aborted — ${error}\n`)
    process.exit(1)
  }

  console.log('✔ .env preflight passed — building dev bundle.')
}
