import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import type { StorybookConfig } from '@storybook/nextjs-vite';

const config: StorybookConfig = {
  stories: [
    '../src/**/*.stories.@(js|jsx|ts|tsx|mdx)',
    '../../../libs/react/*/src/**/*.stories.@(js|jsx|ts|tsx)',
  ],
  addons: [
    getAbsolutePath('@storybook/addon-a11y'),
    getAbsolutePath('@storybook/addon-vitest'),
  ],
  framework: {
    name: getAbsolutePath('@storybook/nextjs-vite'),
    options: {},
  },
  staticDirs: ['../public'],
  // Pre-bundle icons that only appear in a single story. Otherwise Vite's dep
  // optimizer discovers them mid-run and reloads, which fails in-flight
  // Storybook (vitest) tests — see RosterDialog's Download icon.
  async viteFinal(viteConfig) {
    const { mergeConfig } = await import('vite');
    return mergeConfig(viteConfig, {
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
    });
  },
};

function getAbsolutePath(value: string): string {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}

export default config;
