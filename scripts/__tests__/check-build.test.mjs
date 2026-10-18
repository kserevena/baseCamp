// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { validate } from '../check-build.mjs'

const MANIFEST = {
  name: 'BaseCamp',
  display: 'standalone',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
}

const SW = [
  'self.addEventListener("message",e=>{e.data&&"SKIP_WAITING"===e.data.type&&self.skipWaiting()}),',
  'e.clientsClaim(),e.precacheAndRoute([{url:"index.html",revision:"abc"},',
  '{url:"assets/index-abc.js",revision:null},{url:"assets/index-abc.css",revision:null}])',
].join('')

const VALID = {
  'index.html': '<head><link rel="manifest" href="/manifest.webmanifest"><script src="/registerSW.js"></script></head>',
  'registerSW.js': 'navigator.serviceWorker.register("/sw.js")',
  'manifest.webmanifest': JSON.stringify(MANIFEST),
  'sw.js': SW,
  'icon-192.png': 'png',
  'icon-512.png': 'png',
}

function readerFor(overrides = {}) {
  const files = { ...VALID, ...overrides }
  return (path) => files[path] ?? null
}

describe('validate', () => {
  it('returns no problems for a sound build', () => {
    expect(validate(readerFor())).toEqual([])
  })

  it('reports every core file that is missing', () => {
    const problems = validate(() => null)
    expect(problems).toEqual([
      'dist/index.html is missing.',
      'dist/registerSW.js is missing.',
      'dist/manifest.webmanifest is missing.',
      'dist/sw.js is missing.',
    ])
  })

  it('reports index.html without a manifest link or SW registration', () => {
    const problems = validate(readerFor({ 'index.html': '<head></head>' }))
    expect(problems).toHaveLength(2)
    expect(problems[0]).toContain('manifest')
    expect(problems[1]).toContain('registerSW.js')
  })

  it('reports a manifest that is not valid JSON', () => {
    expect(validate(readerFor({ 'manifest.webmanifest': '{nope' }))).toEqual([
      'dist/manifest.webmanifest is not valid JSON.',
    ])
  })

  it('reports a manifest missing its name and standalone display', () => {
    const manifest = JSON.stringify({ icons: MANIFEST.icons })
    expect(validate(readerFor({ 'manifest.webmanifest': manifest }))).toEqual([
      'Manifest has no name.',
      'Manifest display is "(unset)", expected "standalone".',
    ])
  })

  it('reports a manifest with no icons', () => {
    const manifest = JSON.stringify({ name: 'BaseCamp', display: 'standalone' })
    expect(validate(readerFor({ 'manifest.webmanifest': manifest }))).toEqual([
      'Manifest has no 192x192 icon.',
      'Manifest has no 512x512 icon.',
    ])
  })

  it('reports a manifest icon whose file is not in dist', () => {
    expect(validate(readerFor({ 'icon-512.png': null }))).toEqual([
      'Manifest 512x512 icon "icon-512.png" is not in dist/.',
    ])
  })

  it('reports a service worker that precaches nothing', () => {
    const sw = 'self.addEventListener("message",e=>{"SKIP_WAITING"}),e.clientsClaim()'
    expect(validate(readerFor({ 'sw.js': sw }))).toEqual(['dist/sw.js does not precache anything.'])
  })

  it('reports a precache list missing index.html, JS and CSS', () => {
    const sw = 'SKIP_WAITING clientsClaim precacheAndRoute([{url:"registerSW.js"}])'
    expect(validate(readerFor({ 'sw.js': sw }))).toEqual([
      'dist/sw.js does not precache index.html.',
      'dist/sw.js does not precache any JS bundle.',
      'dist/sw.js does not precache any CSS bundle.',
    ])
  })

  it('reports a service worker without SKIP_WAITING or clientsClaim', () => {
    const sw = SW.replace('SKIP_WAITING', 'OTHER').replace('clientsClaim', 'other')
    const problems = validate(readerFor({ 'sw.js': sw }))
    expect(problems).toHaveLength(2)
    expect(problems[0]).toContain('SKIP_WAITING')
    expect(problems[1]).toContain('clientsClaim')
  })
})
