import type { Preview } from '@storybook/react';
import { ThemeProvider } from '@maple/react/theme';
import '../src/app/global.css';

const preview: Preview = {
  decorators: [
    (Story) => (
      <ThemeProvider>
        <Story />
      </ThemeProvider>
    ),
  ],
  parameters: {
    controls: { expanded: true },
    layout: 'centered',
    a11y: {
      // Accessibility testing is enabled for manual review in Storybook UI
      // Set to 'warn' instead of 'error' to not fail tests automatically
      // This allows us to review and fix a11y issues progressively
      test: 'warn',
    },
  },
};

export default preview;
