import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: path.resolve(__dirname),
    include: ['src/**/*.spec.ts'],
    setupFiles: ['./src/setup.ts'],
    testTimeout: 30000,
    sequence: {
      concurrent: false,
    },
  },
});
