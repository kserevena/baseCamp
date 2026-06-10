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
  },
})
