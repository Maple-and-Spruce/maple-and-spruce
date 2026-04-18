import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  test: {
    name: 'react-registrations',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary', 'json'],
      reportsDirectory: '../../../coverage/libs/react/registrations',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.spec.{ts,tsx}',
        'src/**/*.stories.tsx',
        'src/index.ts',
        'src/test-setup.ts',
      ],
    },
  },
});
