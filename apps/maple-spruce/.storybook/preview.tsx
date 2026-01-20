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
      // Enable accessibility testing
      test: 'error', // Fail on accessibility violations
    },
  },
};

export default preview;
