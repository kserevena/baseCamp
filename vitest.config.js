import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.js'],
    exclude: ['**/*.integration.test.js', 'node_modules/**'],
    server: { deps: { inline: ['vuetify'] } },
    // Pocket money date math is UTC-based; pin the test clock to UTC so date parsing
    // and any incidental local-Date use stays deterministic across machines and CI.
    env: { TZ: 'UTC' },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      include: ['src/**', 'scripts/**'],
      // One-off Firestore migration/cleanup scripts (issue #137) are manual ops tooling
      // exercised against the emulator, not app runtime — excluded like devtools/seed.js.
      exclude: [
        'src/test-setup.js', 'src/devtools/seed.js', 'src/firebase/config.js',
        'scripts/migrate-shopping-lists.mjs', 'scripts/delete-old-shopping-lists.mjs',
      ],
      thresholds: {
        statements: 86,
        branches: 83,
        functions: 84,
        lines: 87,
      },
    },
  },
})
