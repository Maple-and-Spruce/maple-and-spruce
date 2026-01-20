import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  test: {
    name: 'webflow',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: '../../../coverage/libs/firebase/webflow',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/index.ts'],
    },
  },
});
