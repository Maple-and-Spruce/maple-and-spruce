import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';

const dirname =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Pre-bundle icons used in only one story so Vite's optimizer doesn't
  // discover them mid-run and reload (which fails in-flight browser tests).
  optimizeDeps: { include: ['@mui/icons-material/Download'] },
  plugins: [
    storybookTest({
      configDir: path.join(dirname, 'apps/maple-spruce/.storybook'),
    }),
  ],
  test: {
    name: 'storybook',
    dir: dirname,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({}),
      instances: [{ browser: 'chromium' }],
    },
    coverage: {
      provider: 'istanbul',
      reporter: ['json'],
      reportsDirectory: path.join(dirname, 'coverage/storybook'),
      all: false,
    },
  },
});
