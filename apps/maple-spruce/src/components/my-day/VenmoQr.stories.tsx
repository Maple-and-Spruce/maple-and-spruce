import type { Meta, StoryObj } from '@storybook/react';
import { expect, waitFor, within } from 'storybook/test';
import { VenmoQr } from './VenmoQr';

const meta = {
  component: VenmoQr,
  title: 'MyDay/VenmoQr',
  parameters: { layout: 'centered' },
  args: { handle: 'maple-spruce' },
} satisfies Meta<typeof VenmoQr>;

export default meta;
type Story = StoryObj<typeof VenmoQr>;

export const Default: Story = {};

export const RendersHandleAndQr: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(canvas.getByText('@maple-spruce')).toBeInTheDocument();
    });
    // qrcode.react renders an SVG.
    expect(canvasElement.querySelector('svg')).toBeInTheDocument();
  },
};
