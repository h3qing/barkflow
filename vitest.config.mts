import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/barkflow/**/*.test.ts', 'src/barkflow/**/*.test.tsx'],
    exclude: ['node_modules', 'src/dist'],
    coverage: {
      provider: 'v8',
      include: ['src/barkflow/**/*.ts', 'src/barkflow/**/*.tsx'],
      exclude: ['src/barkflow/**/*.test.ts', 'src/barkflow/**/*.test.tsx'],
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
      '@barkflow': path.resolve(__dirname, 'src/barkflow'),
    },
  },
})
