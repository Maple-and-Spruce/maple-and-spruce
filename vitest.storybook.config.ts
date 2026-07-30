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
  // Pre-bundle deep imports reachable only through a single story so Vite's
  // optimizer doesn't discover them mid-run and reload (which fails in-flight
  // browser tests). Covers RosterDialog's Download icon and the calendar-links
  // page's icons + Material subcomponents (Snackbar et al. aren't scanned from
  // other stories, so they'd otherwise trigger a mid-run re-optimize).
  optimizeDeps: {
    include: [
      '@mui/icons-material/Download',
      '@mui/icons-material/ContentCopy',
      '@mui/icons-material/EventAvailable',
      '@mui/icons-material/OpenInNew',
      '@mui/material/Box',
      '@mui/material/Card',
      '@mui/material/CardContent',
      '@mui/material/Chip',
      '@mui/material/Divider',
      '@mui/material/IconButton',
      '@mui/material/Link',
      '@mui/material/Snackbar',
      '@mui/material/Stack',
      '@mui/material/Tooltip',
      '@mui/material/Typography',
      '@mui/icons-material/CheckCircle',
      '@mui/icons-material/AccountBalanceWallet',
      '@mui/icons-material/EventBusy',
      '@mui/icons-material/MeetingRoom',
      '@mui/icons-material/ChevronLeft',
      '@mui/icons-material/ChevronRight',
      '@mui/icons-material/Today',
      'qrcode.react',
    ],
  },
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
    },
  },
});
