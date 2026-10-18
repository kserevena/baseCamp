// Post-build guard for CI (`npm run build:check`, run after `npm run build`).
//
// A build that exits 0 can still ship a broken PWA: a vite-plugin-pwa or
// Workbox change could silently stop emitting the service worker, drop the
// manifest link, or stop precaching the app shell — and phones would lose
// offline support or the update banner with no test failing. This script
// inspects `dist/` and fails if any of the files the installed app depends on
// are missing or malformed.
//
// `validate(readFile)` is exported so unit tests can exercise the logic
// directly against fake file contents without running a build.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DIST = resolve(process.cwd(), 'dist')
const REQUIRED_ICON_SIZES = ['192x192', '512x512']

// readFile(path) returns the file's contents as a string, or null if absent.
// Returns an array of problems; an empty array means the build is sound.
export function validate(readFile) {
  const problems = []

  const indexHtml = readFile('index.html')
  if (indexHtml === null) {
    problems.push('dist/index.html is missing.')
  } else {
    if (!/<link[^>]+rel="manifest"/.test(indexHtml)) {
      problems.push('dist/index.html does not link the web app manifest.')
    }
    if (!indexHtml.includes('registerSW.js')) {
      problems.push('dist/index.html does not load registerSW.js, so the service worker is never registered.')
    }
  }

  if (readFile('registerSW.js') === null) {
    problems.push('dist/registerSW.js is missing.')
  }

  const rawManifest = readFile('manifest.webmanifest')
  if (rawManifest === null) {
    problems.push('dist/manifest.webmanifest is missing.')
  } else {
    let manifest = null
    try {
      manifest = JSON.parse(rawManifest)
    } catch {
      problems.push('dist/manifest.webmanifest is not valid JSON.')
    }
    if (manifest) {
      if (!manifest.name) problems.push('Manifest has no name.')
      if (manifest.display !== 'standalone') {
        problems.push(`Manifest display is "${manifest.display ?? '(unset)'}", expected "standalone".`)
      }
      const icons = manifest.icons ?? []
      for (const size of REQUIRED_ICON_SIZES) {
        const icon = icons.find((i) => i.sizes === size)
        if (!icon) {
          problems.push(`Manifest has no ${size} icon.`)
        } else if (readFile(icon.src) === null) {
          problems.push(`Manifest ${size} icon "${icon.src}" is not in dist/.`)
        }
      }
    }
  }

  const sw = readFile('sw.js')
  if (sw === null) {
    problems.push('dist/sw.js is missing.')
  } else {
    if (!sw.includes('precacheAndRoute')) {
      problems.push('dist/sw.js does not precache anything.')
    } else {
      if (!sw.includes('"index.html"')) problems.push('dist/sw.js does not precache index.html.')
      if (!/"assets\/[^"]+\.js"/.test(sw)) problems.push('dist/sw.js does not precache any JS bundle.')
      if (!/"assets\/[^"]+\.css"/.test(sw)) problems.push('dist/sw.js does not precache any CSS bundle.')
    }
    // useServiceWorkerUpdate posts SKIP_WAITING when the user taps Update.
    if (!sw.includes('SKIP_WAITING')) {
      problems.push('dist/sw.js has no SKIP_WAITING handler, so the Update button would do nothing.')
    }
    if (!sw.includes('clientsClaim')) {
      problems.push('dist/sw.js does not call clientsClaim.')
    }
  }

  return problems
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const readFile = (path) => {
    try {
      return readFileSync(resolve(DIST, path), 'utf8')
    } catch {
      return null
    }
  }

  const problems = validate(readFile)
  if (problems.length) {
    console.error('\n✖ build check failed:')
    for (const problem of problems) console.error(`  - ${problem}`)
    console.error('')
    process.exit(1)
  }

  console.log('✔ build check passed — manifest, service worker and precache look sound.')
}
