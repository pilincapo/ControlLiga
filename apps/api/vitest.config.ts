import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['src/test/global-setup.ts'],
    setupFiles: ['src/test/setup.ts'],
    fileParallelism: false,
    hookTimeout: 120000,
    testTimeout: 30000,
  },
})
