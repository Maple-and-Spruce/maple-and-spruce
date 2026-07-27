import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, within, userEvent, waitFor } from 'storybook/test';
import type { GetMusicTogetherDemoRsvpsResponse } from '@maple/ts/firebase/api-types';
import { DemoRsvpsDialog } from './DemoRsvpsDialog';

const withRsvps: GetMusicTogetherDemoRsvpsResponse = {
  rsvps: [
    {
      id: 'jamie@example.com',
      demoSlot: 'Sat Aug 3 · 10:00 AM',
      name: 'Jamie Rivera',
      email: 'jamie@example.com',
      createdAt: new Date('2030-07-01T00:00:00Z'),
    },
    {
      id: 'dana@example.com',
      demoSlot: 'Sat Aug 3 · 10:00 AM',
      name: 'Dana Brooks',
      email: 'dana@example.com',
      createdAt: new Date('2030-07-02T00:00:00Z'),
    },
    {
      id: 'pat@example.com',
      demoSlot: 'Sun Aug 4 · 9:00 AM',
      name: 'Pat Lee',
      email: 'pat@example.com',
      createdAt: new Date('2030-07-03T00:00:00Z'),
    },
  ],
};

const meta = {
  component: DemoRsvpsDialog,
  title: 'MusicTogether/DemoRsvpsDialog',
  parameters: { layout: 'centered', a11y: { disable: true } },
  args: { open: true, onClose: fn() },
} satisfies Meta<typeof DemoRsvpsDialog>;

export default meta;
type Story = StoryObj<typeof DemoRsvpsDialog>;

const body = () => within(document.body);

export const WithRsvps: Story = {
  args: { demoRsvpsState: { status: 'success', data: withRsvps } },
};

export const Empty: Story = {
  args: {
    demoRsvpsState: { status: 'success', data: { rsvps: [] } },
  },
};

export const Loading: Story = {
  args: { demoRsvpsState: { status: 'loading' } },
};

export const ErrorState: Story = {
  args: {
    demoRsvpsState: { status: 'error', error: 'Failed to fetch demo RSVPs' },
  },
};

/**
 * Renders RSVPs grouped by demo slot (with per-group counts) and copies a
 * group's emails to the clipboard.
 */
export const GroupsAndCopiesEmails: Story = {
  args: { demoRsvpsState: { status: 'success', data: withRsvps } },
  play: async () => {
    const canvas = body();
    await waitFor(() =>
      expect(canvas.getByRole('dialog')).toBeInTheDocument()
    );

    // Two slot groups, each with its count.
    await expect(
      canvas.getByText(/Sat Aug 3 · 10:00 AM \(2\)/)
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(/Sun Aug 4 · 9:00 AM \(1\)/)
    ).toBeInTheDocument();
    await expect(canvas.getByText('Jamie Rivera')).toBeInTheDocument();
    await expect(canvas.getByText('Pat Lee')).toBeInTheDocument();

    // Copy emails writes the first group's addresses. `navigator.clipboard` is
    // a getter-only property in the test browser, so define it (Object.assign
    // throws "Cannot set property clipboard").
    const writeText = fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const copyButtons = canvas.getAllByRole('button', { name: /copy emails/i });
    await userEvent.click(copyButtons[0]);
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        'jamie@example.com, dana@example.com'
      )
    );
  },
};

export const EmptyState: Story = {
  args: { demoRsvpsState: { status: 'success', data: { rsvps: [] } } },
  play: async () => {
    const canvas = body();
    await waitFor(() =>
      expect(canvas.getByRole('dialog')).toBeInTheDocument()
    );
    await expect(canvas.getByText(/No RSVPs yet\./i)).toBeInTheDocument();
  },
};
