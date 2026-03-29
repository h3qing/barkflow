import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/whisperwoof/**/*.test.ts', 'src/whisperwoof/**/*.test.tsx'],
    exclude: ['node_modules', 'src/dist'],
    coverage: {
      provider: 'v8',
      include: ['src/whisperwoof/**/*.ts', 'src/whisperwoof/**/*.tsx'],
      exclude: ['src/whisperwoof/**/*.test.ts', 'src/whisperwoof/**/*.test.tsx'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@whisperwoof': path.resolve(__dirname, 'src/whisperwoof'),
    },
  },
})
